import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.pool import NullPool

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.redis import get_redis_sync
from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.services.security_analyzer import (
    compute_security_score_v2,
    resolve_security_score_for_detail,
)
from app.services.operational_event_service import record_event_sync
from app.services.scan_client import call_scan_batch_sync, call_scan_module_sync
from app.services.transformers import ALL_MODULES, MODULE_BATCHES
from app.utils.url_safety import validate_url_safety

# S-10: when a single batch HTTP call to the scan-service fails wholesale
# (connection error, 5xx, MODULE_TIMEOUT_MS), every module that did not yet
# return a result was previously marked FAILED in one go. We now flag those
# modules as RETRYING and re-run them one-by-one. The per-module sync call
# uses the same SCAN_TIMEOUT_MS budget the batch call did, so the worst-case
# extra wall-clock time is bounded.
SCAN_PER_MODULE_RETRY_TIMEOUT_S = float(settings.SCAN_TIMEOUT_MS) / 1000.0
# S-11: a target is treated as "degraded" when at least this many modules
# in the current batch have failed; the SSE payload exposes this so the
# frontend can show "target may be slow / unhealthy" UX hints.
SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD = 3
SECONDS_TO_MILLISECONDS = 1000

logger = logging.getLogger(__name__)
sync_engine = None


def _get_sync_engine():
    global sync_engine
    if sync_engine is None:
        database_url = settings.DATABASE_URL.strip()
        if not database_url:
            raise RuntimeError("DATABASE_URL is not configured")
        sync_engine = create_engine(
            database_url.replace("+asyncpg", "+psycopg2"),
            poolclass=NullPool,
            pool_pre_ping=True,
        )
    return sync_engine


def _cancel_requested_key(scan_id: str) -> str:
    return f"scan:{scan_id}:cancel_requested"


def _is_scan_aborted(db: Session, scan_id: str, redis) -> bool:
    if redis.get(_cancel_requested_key(scan_id)):
        return True
    st = db.execute(select(Scan.status).where(Scan.id == uuid.UUID(scan_id))).scalar_one()
    return st == ScanStatus.CANCELLED


def _get_sync_session() -> Session:
    return Session(_get_sync_engine())


def _coerce_uuid_option(value: object) -> uuid.UUID | None:
    if isinstance(value, uuid.UUID):
        return value
    if isinstance(value, str):
        try:
            return uuid.UUID(value)
        except ValueError:
            return None
    return None


@celery_app.task(name="execute_scan", bind=True, max_retries=1)
def execute_scan(
    self,
    scan_id: str,
    modules_filter: list[str] | None = None,
    scan_options: dict[str, Any] | None = None,
) -> dict:
    """Execute scan modules in batches. If modules_filter is provided, only run those modules."""
    redis = get_redis_sync()
    progress_key = f"scan:{scan_id}:progress"

    logger.info("execute_scan started: scan_id=%s task_id=%s", scan_id, self.request.id)

    try:
        with _get_sync_session() as db:
            st = db.execute(
                select(Scan.status).where(Scan.id == uuid.UUID(scan_id))
            ).scalar_one_or_none()
            if st is None:
                logger.warning("execute_scan: scan not found scan_id=%s", scan_id)
                return {"scan_id": scan_id, "status": "not_found"}
            if st == ScanStatus.CANCELLED:
                logger.info("execute_scan: scan already cancelled scan_id=%s", scan_id)
                return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}
            if st in (ScanStatus.COMPLETED, ScanStatus.FAILED):
                logger.info(
                    "execute_scan: scan already terminal scan_id=%s status=%s",
                    scan_id,
                    st.value,
                )
                return {"scan_id": scan_id, "status": st.value}

            pending_to_running = db.execute(
                update(Scan)
                .where(
                    Scan.id == uuid.UUID(scan_id),
                    Scan.status == ScanStatus.PENDING,
                )
                .values(status=ScanStatus.RUNNING, started_at=datetime.now(timezone.utc))
            )
            db.commit()
            if pending_to_running.rowcount == 0:
                st2 = db.execute(
                    select(Scan.status).where(Scan.id == uuid.UUID(scan_id))
                ).scalar_one()
                if st2 == ScanStatus.CANCELLED:
                    logger.info(
                        "execute_scan: cancelled before start (race) scan_id=%s",
                        scan_id,
                    )
                    return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}
                if st2 != ScanStatus.RUNNING:
                    logger.warning(
                        "execute_scan: unexpected status scan_id=%s status=%s",
                        scan_id,
                        st2.value,
                    )
                    return {"scan_id": scan_id, "status": st2.value}

            scan = db.execute(select(Scan).where(Scan.id == uuid.UUID(scan_id))).scalar_one()
            url = scan.url
            validate_url_safety(url)
            persisted_options = scan.scan_options if isinstance(scan.scan_options, dict) else {}
            effective_scan_options = {
                **persisted_options,
                **(scan_options or {}),
            }
            group_id = _coerce_uuid_option(effective_scan_options.get("urlGroupId"))
            group_run_id = _coerce_uuid_option(
                effective_scan_options.get("urlGroupRunId")
            )
            scan_started_at = datetime.now(timezone.utc)

            all_raw_results: dict[str, dict | None] = {}
            selected = (
                [m for m in modules_filter if m in ALL_MODULES]
                if modules_filter and len(modules_filter) > 0
                else None
            )
            total_modules = (
                len(selected)
                if selected is not None
                else sum(len(b) for b in MODULE_BATCHES.values())
            )
            record_event_sync(
                db,
                event_type="scan.started",
                status="started",
                user_id=scan.user_id,
                target_url=url,
                scan_id=scan.id,
                group_id=group_id,
                group_run_id=group_run_id,
                trace_id=scan_id,
                details={
                    "modulesFilter": selected,
                    "totalModules": total_modules,
                },
            )
            db.commit()

            def _record_scan_cancelled(reason: str) -> None:
                record_event_sync(
                    db,
                    event_type="scan.cancelled",
                    status="cancelled",
                    user_id=scan.user_id,
                    target_url=url,
                    scan_id=scan.id,
                    group_id=group_id,
                    group_run_id=group_run_id,
                    duration_ms=int(
                        (datetime.now(timezone.utc) - scan_started_at).total_seconds()
                        * SECONDS_TO_MILLISECONDS
                    ),
                    error_code="SCAN_CANCELLED",
                    message=reason,
                    trace_id=scan_id,
                )
                db.commit()
            completed = 0
            # S-11: aggregated failure count across batches feeds the
            # degradedTarget flag in the SSE progress payload.
            target_failure_count = 0

            batch_names = ["quick", "medium", "heavy"]
            progress_ranges = [(0, 30), (30, 70), (70, 100)]

            for batch_name, (progress_start, progress_end) in zip(
                batch_names, progress_ranges
            ):
                if _is_scan_aborted(db, scan_id, redis):
                    logger.info("Scan was cancelled, stopping: scan_id=%s", scan_id)
                    _record_scan_cancelled("Scan was cancelled before batch work")
                    return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}

                batch_modules = MODULE_BATCHES[batch_name]
                modules = (
                    [m for m in batch_modules if m in (selected or [])]
                    if selected is not None
                    else list(batch_modules)
                )

                if not modules:
                    continue

                if not _is_scan_aborted(db, scan_id, redis):
                    redis.set(
                        progress_key,
                        json.dumps(
                            {
                                "progress": progress_start,
                                "phase": batch_name,
                                "detail": f"Running {batch_name} modules ({len(modules)} modules)",
                                "completedModules": completed,
                                "totalModules": total_modules,
                                # S-11: per-batch in-flight module list so the UI can
                                # render "currently scanning: status, headers, …".
                                "currentModules": list(modules),
                                "degradedTarget": target_failure_count
                                >= SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD,
                            }
                        ),
                    )

                if _is_scan_aborted(db, scan_id, redis):
                    logger.info(
                        "Scan was cancelled before batch HTTP: scan_id=%s",
                        scan_id,
                    )
                    _record_scan_cancelled("Scan was cancelled before scan-service batch call")
                    return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}

                batch_failed_wholesale = False
                try:
                    batch_result = call_scan_batch_sync(
                        url,
                        modules,
                        effective_scan_options,
                        scan_id=scan_id,
                        trace_id=scan_id,
                    )
                    results = batch_result.get("results", {})

                    for module_name, module_result in results.items():
                        raw_data = module_result.get("data", {})
                        success = module_result.get("success", False)
                        duration_ms = module_result.get("durationMs", 0)

                        all_raw_results[module_name] = raw_data if success else None
                        if not success:
                            target_failure_count += 1

                        db.execute(
                            update(ScanModuleResult)
                            .where(
                                ScanModuleResult.scan_id == uuid.UUID(scan_id),
                                ScanModuleResult.module_name == module_name,
                            )
                            .values(
                                status=ModuleStatus.SUCCESS if success else ModuleStatus.FAILED,
                                raw_result=raw_data,
                                duration_ms=duration_ms,
                                error_message=raw_data.get("error") if not success and isinstance(raw_data, dict) else None,
                                completed_at=datetime.now(timezone.utc),
                            )
                        )
                        completed += 1

                    db.execute(
                        update(Scan)
                        .where(Scan.id == uuid.UUID(scan_id))
                        .values(progress=progress_end, completed_modules=completed)
                    )
                    db.commit()

                except Exception as exc:
                    logger.exception(
                        "Batch failed: scan_id=%s batch=%s completed=%s total=%s",
                        scan_id,
                        batch_name,
                        completed,
                        total_modules,
                    )
                    record_event_sync(
                        db,
                        event_type="scan_service.batch_failed",
                        status="retrying",
                        user_id=scan.user_id,
                        target_url=url,
                        scan_id=scan.id,
                        group_id=group_id,
                        group_run_id=group_run_id,
                        error_code="SCAN_SERVICE_BATCH_FAILED",
                        message=str(exc),
                        trace_id=scan_id,
                        details={"batch": batch_name, "modules": modules},
                    )
                    db.commit()
                    batch_failed_wholesale = True

                if batch_failed_wholesale:
                    # S-10: don't slam every still-pending module to FAILED. Mark
                    # them RETRYING so the UI shows the transient state, then
                    # re-run each one individually below. This recovers from the
                    # common "scan-service was momentarily 5xx during the batch
                    # round-trip" failure mode without losing modules whose
                    # individual call would have succeeded.
                    pending_modules = [
                        m for m in modules if m not in all_raw_results
                    ]
                    if pending_modules:
                        db.execute(
                            update(ScanModuleResult)
                            .where(
                                ScanModuleResult.scan_id == uuid.UUID(scan_id),
                                ScanModuleResult.module_name.in_(pending_modules),
                            )
                            .values(
                                status=ModuleStatus.RETRYING,
                                error_message="Batch HTTP failed; retrying per module",
                            )
                        )
                        db.commit()
                        record_event_sync(
                            db,
                            event_type="scan_service.per_module_retry_started",
                            status="retrying",
                            user_id=scan.user_id,
                            target_url=url,
                            scan_id=scan.id,
                            group_id=group_id,
                            group_run_id=group_run_id,
                            retry_count=len(pending_modules),
                            trace_id=scan_id,
                            details={"batch": batch_name, "modules": pending_modules},
                        )
                        db.commit()
                        redis.set(
                            progress_key,
                            json.dumps(
                                {
                                    "progress": progress_start,
                                    "phase": batch_name,
                                    "detail": (
                                        f"Retrying {len(pending_modules)} {batch_name}"
                                        f" modules individually"
                                    ),
                                    "completedModules": completed,
                                    "totalModules": total_modules,
                                    "currentModules": pending_modules,
                                    "degradedTarget": True,
                                }
                            ),
                        )
                        retry_success_count = 0
                        retry_failure_count = 0
                        for module_name in pending_modules:
                            if _is_scan_aborted(db, scan_id, redis):
                                _record_scan_cancelled("Scan was cancelled during per-module retry")
                                return {
                                    "scan_id": scan_id,
                                    "status": ScanStatus.CANCELLED.value,
                                }
                            envelope = call_scan_module_sync(
                                module_name,
                                url,
                                effective_scan_options,
                                scan_id=scan_id,
                                trace_id=scan_id,
                                timeout_s=SCAN_PER_MODULE_RETRY_TIMEOUT_S,
                            )
                            raw_data = envelope.get("data") or {}
                            success = bool(envelope.get("success"))
                            duration_ms = int(envelope.get("durationMs") or 0)
                            all_raw_results[module_name] = raw_data if success else None
                            if success:
                                retry_success_count += 1
                            else:
                                retry_failure_count += 1
                            if not success:
                                target_failure_count += 1
                            error_message = None
                            if not success:
                                error_message = (
                                    envelope.get("error")
                                    or (
                                        raw_data.get("error")
                                        if isinstance(raw_data, dict)
                                        else None
                                    )
                                    or "Module retry failed"
                                )
                            db.execute(
                                update(ScanModuleResult)
                                .where(
                                    ScanModuleResult.scan_id == uuid.UUID(scan_id),
                                    ScanModuleResult.module_name == module_name,
                                )
                                .values(
                                    status=ModuleStatus.SUCCESS
                                    if success
                                    else ModuleStatus.FAILED,
                                    raw_result=raw_data,
                                    duration_ms=duration_ms,
                                    error_message=error_message,
                                    completed_at=datetime.now(timezone.utc),
                                )
                            )
                            completed += 1
                            db.commit()
                        record_event_sync(
                            db,
                            event_type="scan_service.per_module_retry_completed",
                            status="failed" if retry_failure_count else "succeeded",
                            user_id=scan.user_id,
                            target_url=url,
                            scan_id=scan.id,
                            group_id=group_id,
                            group_run_id=group_run_id,
                            retry_count=len(pending_modules),
                            error_code=(
                                "MODULE_RETRY_FAILED"
                                if retry_failure_count
                                else None
                            ),
                            trace_id=scan_id,
                            details={
                                "batch": batch_name,
                                "retriedModules": pending_modules,
                                "succeeded": retry_success_count,
                                "failed": retry_failure_count,
                            },
                        )
                        db.commit()
                    db.execute(
                        update(Scan)
                        .where(Scan.id == uuid.UUID(scan_id))
                        .values(progress=progress_end, completed_modules=completed)
                    )
                    db.commit()

                if _is_scan_aborted(db, scan_id, redis):
                    logger.info(
                        "Scan was cancelled after batch work: scan_id=%s",
                        scan_id,
                    )
                    _record_scan_cancelled("Scan was cancelled after batch work")
                    return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}

                redis.set(
                    progress_key,
                    json.dumps(
                        {
                            "progress": progress_end,
                            "phase": batch_name,
                            "detail": f"Completed {batch_name} batch",
                            "completedModules": completed,
                            "totalModules": total_modules,
                            "currentModules": [],
                            "degradedTarget": target_failure_count
                            >= SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD,
                        }
                    ),
                )

            # Skip final update if scan was cancelled (avoid overwriting CANCELLED)
            current_status = (
                db.execute(select(Scan.status).where(Scan.id == uuid.UUID(scan_id)))
            ).scalar_one()
            if current_status == ScanStatus.CANCELLED:
                logger.info("Scan was cancelled, skipping final update: scan_id=%s", scan_id)
                _record_scan_cancelled("Scan was cancelled before final update")
                return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}

            success_count = sum(1 for v in all_raw_results.values() if v is not None)
            final_status = ScanStatus.COMPLETED if success_count > 0 else ScanStatus.FAILED

            security_score = 0
            if success_count > 0:
                try:
                    scan_final = db.execute(
                        select(Scan)
                        .where(Scan.id == uuid.UUID(scan_id))
                        .options(selectinload(Scan.module_results)),
                    ).scalar_one()
                    v2 = compute_security_score_v2(all_raw_results, scan_final.module_results)
                    security_score = 0 if v2 is None else v2.score
                except Exception as err:
                    logger.exception(
                        "security_score computation failed: scan_id=%s err=%s",
                        scan_id, err,
                    )
                    security_score = 0

            db.execute(
                update(Scan)
                .where(Scan.id == uuid.UUID(scan_id))
                .values(
                    status=final_status,
                    progress=100,
                    completed_modules=completed,
                    completed_at=datetime.now(timezone.utc),
                    error_message=None if success_count > 0 else "Scan failed for all modules",
                    security_score=security_score,
                )
            )
            if target_failure_count >= SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD:
                record_event_sync(
                    db,
                    event_type="scan_service.target_degraded",
                    status="degraded",
                    user_id=scan.user_id,
                    target_url=url,
                    scan_id=scan.id,
                    group_id=group_id,
                    group_run_id=group_run_id,
                    error_code="TARGET_DEGRADED",
                    message="Multiple scan modules failed for this target",
                    trace_id=scan_id,
                    details={"failedModules": target_failure_count},
                )
            record_event_sync(
                db,
                event_type="scan.completed",
                status=final_status.value,
                user_id=scan.user_id,
                target_url=url,
                scan_id=scan.id,
                group_id=group_id,
                group_run_id=group_run_id,
                duration_ms=int(
                    (datetime.now(timezone.utc) - scan_started_at).total_seconds()
                    * SECONDS_TO_MILLISECONDS
                ),
                error_code="SCAN_FAILED" if final_status == ScanStatus.FAILED else None,
                message=None if success_count > 0 else "Scan failed for all modules",
                trace_id=scan_id,
                details={
                    "succeededModules": success_count,
                    "totalModules": total_modules,
                    "securityScore": security_score,
                    "degradedTarget": target_failure_count
                    >= SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD,
                },
            )
            db.commit()

            redis.set(
                progress_key,
                json.dumps(
                    {
                        "progress": 100,
                        "phase": "done",
                        "detail": f"Scan complete. {success_count}/{total_modules} modules succeeded.",
                        "completedModules": completed,
                        "totalModules": total_modules,
                        "currentModules": [],
                        "degradedTarget": target_failure_count
                        >= SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD,
                    }
                ),
            )
            redis.expire(progress_key, 3600)

            logger.info(
                "execute_scan completed: scan_id=%s success=%s total=%s status=%s",
                scan_id,
                success_count,
                total_modules,
                final_status.value,
            )
            return {"scan_id": scan_id, "status": final_status.value}
    except Exception:
        logger.exception("execute_scan fatal failure: scan_id=%s", scan_id)
        redis.set(
            progress_key,
            json.dumps(
                {
                    "progress": 0,
                    "phase": "error",
                    "detail": "Scan task failed due to an internal error",
                    "completedModules": 0,
                    "totalModules": 0,
                    "currentModules": [],
                    "degradedTarget": False,
                    "error": True,
                }
            ),
        )
        redis.expire(progress_key, 3600)
        with _get_sync_session() as db:
            scan_row = db.execute(
                select(Scan)
                .where(Scan.id == uuid.UUID(scan_id))
                .options(selectinload(Scan.module_results))
            ).scalar_one_or_none()

            security_val: int | None = None
            if scan_row is not None:
                all_raw_fatal = {
                    m.module_name: m.raw_result
                    for m in scan_row.module_results
                    if m.raw_result is not None
                }
                resolved_fatal = resolve_security_score_for_detail(
                    stored_score=scan_row.security_score,
                    scan_status=scan_row.status,
                    module_results=scan_row.module_results,
                    all_raw=all_raw_fatal,
                    from_incomplete_run=True,
                )
                security_val = resolved_fatal.score
                fatal_options = (
                    scan_row.scan_options if isinstance(scan_row.scan_options, dict) else {}
                )
                record_event_sync(
                    db,
                    event_type="scan.failed",
                    status="failed",
                    user_id=scan_row.user_id,
                    target_url=scan_row.url,
                    scan_id=scan_row.id,
                    group_id=_coerce_uuid_option(fatal_options.get("urlGroupId")),
                    group_run_id=_coerce_uuid_option(
                        fatal_options.get("urlGroupRunId")
                    ),
                    error_code="SCAN_TASK_FATAL",
                    message="Scan failed due to an internal error",
                    trace_id=scan_id,
                )

            values: dict[str, Any] = {
                "status": ScanStatus.FAILED,
                "error_message": "Scan failed due to an internal error",
                "completed_at": datetime.now(timezone.utc),
            }
            if security_val is not None:
                values["security_score"] = security_val

            db.execute(
                update(Scan)
                .where(Scan.id == uuid.UUID(scan_id))
                .values(**values)
            )
            db.commit()
        return {"scan_id": scan_id, "status": ScanStatus.FAILED.value}
    finally:
        redis.close()
