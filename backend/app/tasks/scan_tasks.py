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
from app.services.scan_client import call_scan_batch_sync
from app.services.transformers import ALL_MODULES, MODULE_BATCHES
from app.utils.url_safety import validate_url_safety

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
            completed = 0

            batch_names = ["quick", "medium", "heavy"]
            progress_ranges = [(0, 30), (30, 70), (70, 100)]

            for batch_name, (progress_start, progress_end) in zip(
                batch_names, progress_ranges
            ):
                if _is_scan_aborted(db, scan_id, redis):
                    logger.info("Scan was cancelled, stopping: scan_id=%s", scan_id)
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
                            }
                        ),
                    )

                if _is_scan_aborted(db, scan_id, redis):
                    logger.info(
                        "Scan was cancelled before batch HTTP: scan_id=%s",
                        scan_id,
                    )
                    return {"scan_id": scan_id, "status": ScanStatus.CANCELLED.value}

                try:
                    batch_result = call_scan_batch_sync(url, modules, effective_scan_options)
                    results = batch_result.get("results", {})

                    for module_name, module_result in results.items():
                        raw_data = module_result.get("data", {})
                        success = module_result.get("success", False)
                        duration_ms = module_result.get("durationMs", 0)

                        all_raw_results[module_name] = raw_data if success else None

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

                except Exception:
                    logger.exception(
                        "Batch failed: scan_id=%s batch=%s completed=%s total=%s",
                        scan_id,
                        batch_name,
                        completed,
                        total_modules,
                    )
                    for module_name in modules:
                        if module_name not in all_raw_results:
                            db.execute(
                                update(ScanModuleResult)
                                .where(
                                    ScanModuleResult.scan_id == uuid.UUID(scan_id),
                                    ScanModuleResult.module_name == module_name,
                                )
                                .values(
                                    status=ModuleStatus.FAILED,
                                    error_message="Module batch failed",
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

                if _is_scan_aborted(db, scan_id, redis):
                    logger.info(
                        "Scan was cancelled after batch work: scan_id=%s",
                        scan_id,
                    )
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
                        }
                    ),
                )

            # Skip final update if scan was cancelled (avoid overwriting CANCELLED)
            current_status = (
                db.execute(select(Scan.status).where(Scan.id == uuid.UUID(scan_id)))
            ).scalar_one()
            if current_status == ScanStatus.CANCELLED:
                logger.info("Scan was cancelled, skipping final update: scan_id=%s", scan_id)
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
