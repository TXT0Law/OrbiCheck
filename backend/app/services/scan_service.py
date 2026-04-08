import asyncio
import inspect
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from sqlalchemy import asc, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.redis import get_redis_async
from app.core.exceptions import (
    InvalidModuleNameError,
    ModuleAlreadySuccessfulError,
    ScanNotCancellableError,
    ScanNotFoundError,
    ScanNotRescannableError,
    ScanNotRetryableError,
    ScanServiceError,
)
from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.tasks.scan_tasks import execute_scan
from app.services.security_analyzer import compute_security_score_v2
from app.services.scan_client import call_scan_module
from app.services.transformers import ALL_MODULES
from app.utils.url_safety import validate_url_safety

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)

SCAN_PROGRESS_REDIS_TTL = 3600
SCAN_CANCEL_REQUESTED_TTL = 86400

TERMINAL_STATUSES = (ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED)
CANCELLABLE_STATUSES = (ScanStatus.PENDING, ScanStatus.RUNNING)
PORTS_MODULE = "ports"
DEFAULT_PORT_SCAN_PROFILE = "quick"


async def _get_scan_for_user(
    db: AsyncSession,
    scan_id: uuid.UUID,
    user_id: int | None,
) -> Scan:
    if user_id is None or len(inspect.signature(get_scan).parameters) < 3:
        return await get_scan(db, scan_id)
    return await get_scan(db, scan_id, user_id)


async def _refresh_scan_security_score(db: AsyncSession, scan_id: uuid.UUID) -> None:
    """Recompute security_score from successful module rows after a module retry or update."""
    stmt = (
        select(Scan)
        .where(Scan.id == scan_id)
        .options(selectinload(Scan.module_results))
    )
    result = await db.execute(stmt)
    scan_row = result.scalar_one_or_none()
    if scan_row is None:
        return
    all_raw: dict[str, dict] = {}
    for m in scan_row.module_results:
        if m.status == ModuleStatus.SUCCESS and isinstance(m.raw_result, dict):
            all_raw[m.module_name] = m.raw_result
    if not all_raw:
        return
    try:
        v2 = compute_security_score_v2(all_raw, scan_row.module_results)
        security_score = 0 if v2 is None else v2.score
    except Exception:
        logger.exception(
            "security_score recompute failed after module update scan_id=%s",
            scan_id,
        )
        return
    await db.execute(
        update(Scan).where(Scan.id == scan_id).values(security_score=security_score)
    )
    await db.commit()


async def _best_effort_clear_scan_redis_keys(scan_id: uuid.UUID) -> None:
    """Remove progress / cancel flag keys; never raises (Redis optional for correctness)."""
    progress_key = f"scan:{scan_id}:progress"
    cancel_flag_key = f"scan:{scan_id}:cancel_requested"
    try:
        redis_client = await get_redis_async()
        try:
            await redis_client.delete(progress_key, cancel_flag_key)
        finally:
            await redis_client.aclose()
    except Exception:
        logger.warning(
            "Redis cleanup failed for scan_id=%s (ignored)",
            scan_id,
            exc_info=True,
        )


def _build_scan_filters(search: str | None, status_group: str) -> list:
    filters = []

    if search and search.strip():
        like_expr = f"%{search.strip()}%"
        filters.append(or_(Scan.domain.ilike(like_expr), Scan.url.ilike(like_expr)))

    if status_group != "all":
        status_filters = {
            "pending": [ScanStatus.PENDING],
            "running": [ScanStatus.RUNNING],
            "completed": [ScanStatus.COMPLETED],
            "failed": [ScanStatus.FAILED],
            "cancelled": [ScanStatus.CANCELLED],
            "active": [ScanStatus.PENDING, ScanStatus.RUNNING],
            "terminal": [ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED],
        }
        mapped_statuses = status_filters.get(status_group)
        if mapped_statuses:
            filters.append(Scan.status.in_(mapped_statuses))

    return filters


async def create_scan(
    db: AsyncSession,
    url: str,
    modules: list[str] | None = None,
    user_id: int = 1,
    enable_port_scan: bool = False,
    port_scan_profile: str = DEFAULT_PORT_SCAN_PROFILE,
    acknowledge_scan_authorization: bool = False,
) -> Scan:
    """Create a new scan record and its module result slots.

    If modules is provided (non-empty), only those modules are executed;
    others get status=SUCCESS with raw_result={skipped:true}.
    If modules is None or empty, all modules run (same as before).
    """
    validate_url_safety(url)
    domain = urlparse(url).hostname or url
    selected = (
        [m for m in modules if m in ALL_MODULES]
        if modules and len(modules) > 0
        else list(ALL_MODULES)
    )
    selected = list(dict.fromkeys(selected))
    if not enable_port_scan and PORTS_MODULE in selected:
        selected = [module_name for module_name in selected if module_name != PORTS_MODULE]

    scan = Scan(
        url=url,
        domain=domain,
        user_id=user_id,
        status=ScanStatus.PENDING,
        total_modules=len(selected),
        scan_options={
            "enablePortScan": enable_port_scan,
            "portScanProfile": port_scan_profile,
            "acknowledgeScanAuthorization": acknowledge_scan_authorization,
        },
    )
    db.add(scan)
    await db.flush()

    now = datetime.now(timezone.utc)
    skipped_payload = {"skipped": True, "data": {"note": "Skipped by user"}}
    port_scan_skipped_payload = {
        "skipped": True,
        "data": {"note": "Skipped because port scanning is disabled"},
    }

    for module_name in ALL_MODULES:
        if module_name in selected:
            module_result = ScanModuleResult(
                scan_id=scan.id,
                module_name=module_name,
                status=ModuleStatus.PENDING,
            )
        else:
            skipped_result = (
                port_scan_skipped_payload
                if module_name == PORTS_MODULE and not enable_port_scan
                else skipped_payload
            )
            module_result = ScanModuleResult(
                scan_id=scan.id,
                module_name=module_name,
                status=ModuleStatus.SUCCESS,
                raw_result=skipped_result,
                duration_ms=0,
                completed_at=now,
            )
        db.add(module_result)

    await db.flush()
    return scan


async def get_scan(
    db: AsyncSession,
    scan_id: uuid.UUID,
    user_id: int | None = None,
) -> Scan:
    """Get a scan with all module results."""
    stmt = select(Scan).where(Scan.id == scan_id)
    if user_id is not None:
        stmt = stmt.where(Scan.user_id == user_id)
    stmt = stmt.options(selectinload(Scan.module_results))
    result = await db.execute(stmt)
    scan = result.scalar_one_or_none()
    if not scan:
        raise ScanNotFoundError(str(scan_id))
    return scan


async def list_scans(
    db: AsyncSession,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
    sort_by: str = "created_at_desc",
    status_group: str = "all",
) -> tuple[list[Scan], int]:
    """List scans with pagination, optional search/filtering, and sorting."""
    filters = [Scan.user_id == user_id, *_build_scan_filters(search=search, status_group=status_group)]

    sort_options = {
        "created_at_desc": desc(Scan.created_at),
        "created_at_asc": asc(Scan.created_at),
        "security_score_desc": desc(Scan.security_score),
        "security_score_asc": asc(Scan.security_score),
        "domain_asc": asc(Scan.domain),
        "domain_desc": desc(Scan.domain),
        "progress_desc": desc(Scan.progress),
    }
    order_clause = sort_options.get(sort_by, desc(Scan.created_at))

    count_stmt = select(func.count()).select_from(Scan)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = select(Scan)
    if filters:
        stmt = stmt.where(*filters)

    stmt = stmt.order_by(order_clause).limit(limit).offset(offset)
    result = await db.execute(stmt)
    scans = list(result.scalars().all())
    return scans, total


async def cancel_scan(db: AsyncSession, scan_id: uuid.UUID, user_id: int | None = None) -> Scan:
    """
    Cancel a scan, revoking its Celery task if running.
    Only PENDING or RUNNING scans can be cancelled.
    Preserves the scan record and partial results.
    """
    scan = await _get_scan_for_user(db, scan_id, user_id)

    if scan.status not in CANCELLABLE_STATUSES:
        raise ScanNotCancellableError(str(scan_id), scan.status.value)

    if scan.celery_task_id and scan.status == ScanStatus.RUNNING:
        try:
            await asyncio.to_thread(
                celery_app.control.revoke,
                scan.celery_task_id,
                terminate=True,
                signal="SIGTERM",
            )
        except Exception as exc:
            logger.warning(
                "Celery revoke failed for scan_id=%s task_id=%s: %s",
                scan_id,
                scan.celery_task_id,
                exc,
                exc_info=True,
            )

    now = datetime.now(timezone.utc)
    scan.status = ScanStatus.CANCELLED
    scan.completed_at = now
    await db.flush()

    progress_key = f"scan:{scan_id}:progress"
    cancel_flag_key = f"scan:{scan_id}:cancel_requested"
    progress_val = int(scan.progress or 0)
    completed_mod = int(scan.completed_modules or 0)
    total_mod = int(scan.total_modules or 0)

    try:
        redis_client = await get_redis_async()
        try:
            raw = await redis_client.get(progress_key)
            if raw:
                try:
                    prev = json.loads(raw)
                    if isinstance(prev, dict):
                        progress_val = int(prev.get("progress", progress_val))
                        completed_mod = int(prev.get("completedModules", completed_mod))
                        total_mod = int(prev.get("totalModules", total_mod))
                except (json.JSONDecodeError, TypeError, ValueError):
                    pass
            terminal_payload = {
                "progress": progress_val,
                "phase": "cancelled",
                "detail": "Scan cancelled by user",
                "completedModules": completed_mod,
                "totalModules": total_mod,
                "cancelled": True,
            }
            await redis_client.set(progress_key, json.dumps(terminal_payload))
            await redis_client.expire(progress_key, SCAN_PROGRESS_REDIS_TTL)
            await redis_client.set(cancel_flag_key, "1")
            await redis_client.expire(cancel_flag_key, SCAN_CANCEL_REQUESTED_TTL)
        finally:
            await redis_client.aclose()
    except Exception:
        logger.warning(
            "cancel_scan Redis update failed scan_id=%s (DB cancel still applies)",
            scan_id,
            exc_info=True,
        )

    logger.info("Scan cancelled: scan_id=%s", scan_id)
    return scan


async def delete_scan(
    db: AsyncSession,
    scan_id: uuid.UUID,
    user_id: int | None = None,
) -> None:
    """
    Delete a scan and its module results (cascade).

    RUNNING/PENDING rows are allowed so users can remove zombie scans (e.g. worker
    lost after restart) without a working cancel path. Redis keys are cleared
    best-effort so SSE / stale flags do not leak.
    """
    scan = await _get_scan_for_user(db, scan_id, user_id)
    await _best_effort_clear_scan_redis_keys(scan_id)
    await db.delete(scan)


async def rescan(
    db: AsyncSession,
    scan_id: uuid.UUID,
    background_tasks: "BackgroundTasks | None" = None,
    user_id: int | None = None,
) -> Scan:
    """
    Reset the existing scan in-place and re-trigger the Celery task.
    Same scan record is reused to avoid duplicate URLs in the list.
    Only allowed on terminal-state scans.
    """
    existing = await _get_scan_for_user(db, scan_id, user_id)

    if existing.status not in TERMINAL_STATUSES:
        raise ScanNotRescannableError(str(scan_id), existing.status.value)

    # Clear module results and recreate slots
    for mr in existing.module_results:
        await db.delete(mr)
    await db.flush()

    scan_options = getattr(existing, "scan_options", None) or {}
    enable_port_scan = bool(scan_options.get("enablePortScan", False))
    port_scan_profile = str(
        scan_options.get("portScanProfile", DEFAULT_PORT_SCAN_PROFILE)
    )

    for module_name in ALL_MODULES:
        if module_name == PORTS_MODULE and not enable_port_scan:
            module_result = ScanModuleResult(
                scan_id=existing.id,
                module_name=module_name,
                status=ModuleStatus.SUCCESS,
                raw_result={
                    "skipped": True,
                    "data": {"note": "Skipped because port scanning is disabled"},
                },
                duration_ms=0,
                completed_at=datetime.now(timezone.utc),
            )
        else:
            module_result = ScanModuleResult(
                scan_id=existing.id,
                module_name=module_name,
                status=ModuleStatus.PENDING,
            )
        db.add(module_result)
    await db.flush()

    existing.status = ScanStatus.PENDING
    existing.progress = 0
    existing.completed_modules = 0
    existing.total_modules = len(ALL_MODULES) if enable_port_scan else len(ALL_MODULES) - 1
    existing.security_score = None
    existing.error_message = None
    existing.started_at = None
    existing.completed_at = None
    existing.celery_task_id = None
    await db.flush()

    # Drop stale Redis keys from a prior cancel on this scan id; otherwise
    # execute_scan sees cancel_requested and exits immediately at 0%.
    scan_id_str = str(existing.id)
    progress_key = f"scan:{scan_id_str}:progress"
    cancel_flag_key = f"scan:{scan_id_str}:cancel_requested"
    redis_client = await get_redis_async()
    try:
        await redis_client.delete(progress_key, cancel_flag_key)
    finally:
        await redis_client.aclose()

    if settings.APP_ENV.lower() == "development" and background_tasks:
        background_tasks.add_task(
            execute_scan.run,
            str(existing.id),
            None,
            {
                "enablePortScan": enable_port_scan,
                "portScanProfile": port_scan_profile,
            },
        )
    elif settings.APP_ENV.lower() != "development":
        task = execute_scan.delay(
            str(existing.id),
            None,
            {
                "enablePortScan": enable_port_scan,
                "portScanProfile": port_scan_profile,
            },
        )
        existing.celery_task_id = task.id if task else None
        existing.status = ScanStatus.RUNNING
        existing.started_at = datetime.now(timezone.utc)
        await db.flush()

    logger.info("scan_rescanned", scan_id=str(scan_id), url=existing.url)
    return existing


async def delete_scans(
    db: AsyncSession,
    user_id: int,
    search: str | None = None,
    status_group: str = "all",
) -> int:
    """Bulk delete scans by optional filter criteria."""
    filters = [Scan.user_id == user_id, *_build_scan_filters(search=search, status_group=status_group)]

    stmt = select(Scan)
    if filters:
        stmt = stmt.where(*filters)

    result = await db.execute(stmt)
    scans = list(result.scalars().all())
    for scan in scans:
        await db.delete(scan)

    return len(scans)


async def retry_module(
    db: AsyncSession,
    scan_id: uuid.UUID,
    module_name: str,
    user_id: int | None = None,
) -> dict:
    """
    Retry a single module for an existing scan.
    Only allowed for terminal-state scans and failed/timed-out modules.
    """
    import time

    scan = await _get_scan_for_user(db, scan_id, user_id)
    validate_url_safety(scan.url)

    if scan.status not in TERMINAL_STATUSES:
        raise ScanNotRetryableError(
            f"Scan is {scan.status.value}. Module retry only allowed on "
            "completed/failed/cancelled scans."
        )

    if module_name not in ALL_MODULES:
        raise InvalidModuleNameError(f"Unknown module: {module_name}")

    existing = next(
        (m for m in scan.module_results if m.module_name == module_name),
        None,
    )

    if existing and existing.status == ModuleStatus.SUCCESS:
        from app.services.transformers import _is_skipped as _check_skipped

        if not _check_skipped(existing):
            raise ModuleAlreadySuccessfulError(
                f"Module {module_name} already succeeded. No retry needed."
            )

    started_at = time.perf_counter()
    try:
        resp = await call_scan_module(module_name, scan.url)
    except Exception as exc:
        logger.exception(
            "retry_module scan_service_call_failed scan_id=%s module=%s",
            scan_id,
            module_name,
        )
        raise ScanServiceError("Failed to call scan service") from exc

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    status_code = resp.get("status_code", 500)
    data = resp.get("data") or {}

    success = 200 <= status_code < 400
    if isinstance(data, dict) and "success" in data:
        success = bool(data.get("success"))

    new_status = ModuleStatus.SUCCESS if success else ModuleStatus.FAILED
    error_msg = None
    if isinstance(data, dict):
        error_msg = data.get("error") or data.get("message")
    if not error_msg and not success:
        error_msg = f"HTTP {status_code}"

    result_duration = duration_ms
    if isinstance(data, dict) and "durationMs" in data:
        result_duration = int(data.get("durationMs", duration_ms))

    raw_result = data if isinstance(data, dict) else {"data": data}

    now = datetime.now(timezone.utc)
    if existing:
        existing.status = new_status
        existing.duration_ms = result_duration
        existing.error_message = error_msg
        existing.raw_result = raw_result
        existing.completed_at = now
    else:
        new_row = ScanModuleResult(
            scan_id=scan.id,
            module_name=module_name,
            status=new_status,
            duration_ms=result_duration,
            error_message=error_msg,
            raw_result=raw_result,
            completed_at=now,
        )
        db.add(new_row)

    await db.commit()
    if existing:
        await db.refresh(existing)
    else:
        await db.refresh(new_row)

    await _refresh_scan_security_score(db, scan_id)

    display_status = "success" if new_status == ModuleStatus.SUCCESS else "failed"
    if "timed out" in str(error_msg or "").lower():
        display_status = "timed-out"

    logger.info(
        "module_retried",
        scan_id=str(scan_id),
        module=module_name,
        new_status=display_status,
        duration_ms=result_duration,
    )

    return {
        "module": module_name,
        "status": display_status,
        "durationMs": result_duration,
        "error": error_msg,
        "data": raw_result.get("data", raw_result) if isinstance(raw_result, dict) else {},
    }
