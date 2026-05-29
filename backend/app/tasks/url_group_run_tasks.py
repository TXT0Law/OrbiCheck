"""Celery orchestration for URL group batch scans."""

import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.celery_app import celery_app
from app.core.redis import get_redis_sync
from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.models.url_group import (
    UrlGroupRun,
    UrlGroupRunMember,
    UrlGroupRunMemberStatus,
    UrlGroupRunStatus,
)
from app.services.scan_service import DEFAULT_PORT_SCAN_PROFILE, PORTS_MODULE
from app.services.transformers import ALL_MODULES
from app.services.url_group_run_service import GROUP_RUN_PROGRESS_REDIS_TTL_SECONDS
from app.tasks.scan_tasks import _get_sync_session, execute_scan
from app.utils.url_safety import validate_url_safety

logger = logging.getLogger(__name__)


def _progress_key(run_id: str) -> str:
    return f"url-group-run:{run_id}:progress"


def _progress_percent(run: UrlGroupRun) -> int:
    if run.total_members <= 0:
        return 100
    finished = (
        run.completed_members
        + run.failed_members
        + run.cancelled_members
        + run.skipped_members
    )
    return min(100, int((finished / run.total_members) * 100))


def _publish_progress(redis, run: UrlGroupRun) -> None:
    payload = {
        "runId": str(run.id),
        "groupId": str(run.group_id),
        "status": run.status.value,
        "progress": _progress_percent(run),
        "totalMembers": run.total_members,
        "queuedMembers": run.queued_members,
        "runningMembers": run.running_members,
        "completedMembers": run.completed_members,
        "failedMembers": run.failed_members,
        "cancelledMembers": run.cancelled_members,
        "skippedMembers": run.skipped_members,
        "currentUrls": [
            member.url
            for member in run.members
            if member.status == UrlGroupRunMemberStatus.RUNNING
        ],
        "members": [
            {
                "id": str(member.id),
                "groupMemberId": str(member.group_member_id),
                "url": member.url,
                "scanId": str(member.scan_id) if member.scan_id else None,
                "status": member.status.value,
                "errorMessage": member.error_message,
            }
            for member in run.members
        ],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    redis.set(_progress_key(str(run.id)), json.dumps(payload, default=str))
    if run.status in (
        UrlGroupRunStatus.COMPLETED,
        UrlGroupRunStatus.FAILED,
        UrlGroupRunStatus.CANCELLED,
        UrlGroupRunStatus.PARTIAL,
    ):
        redis.expire(_progress_key(str(run.id)), GROUP_RUN_PROGRESS_REDIS_TTL_SECONDS)


def _recalculate_counts(run: UrlGroupRun) -> None:
    counts = {
        UrlGroupRunMemberStatus.QUEUED: 0,
        UrlGroupRunMemberStatus.CREATING_SCAN: 0,
        UrlGroupRunMemberStatus.RUNNING: 0,
        UrlGroupRunMemberStatus.COMPLETED: 0,
        UrlGroupRunMemberStatus.FAILED: 0,
        UrlGroupRunMemberStatus.CANCELLED: 0,
        UrlGroupRunMemberStatus.SKIPPED: 0,
    }
    for member in run.members:
        counts[member.status] += 1
    run.queued_members = counts[UrlGroupRunMemberStatus.QUEUED]
    run.running_members = (
        counts[UrlGroupRunMemberStatus.CREATING_SCAN]
        + counts[UrlGroupRunMemberStatus.RUNNING]
    )
    run.completed_members = counts[UrlGroupRunMemberStatus.COMPLETED]
    run.failed_members = counts[UrlGroupRunMemberStatus.FAILED]
    run.cancelled_members = counts[UrlGroupRunMemberStatus.CANCELLED]
    run.skipped_members = counts[UrlGroupRunMemberStatus.SKIPPED]


def _create_scan_for_member(
    db: Session,
    member: UrlGroupRunMember,
    user_id: int,
    modules: list[str] | None,
    scan_options: dict[str, Any],
) -> Scan:
    validate_url_safety(member.url)
    selected = (
        [module for module in modules if module in ALL_MODULES]
        if modules and len(modules) > 0
        else list(ALL_MODULES)
    )
    selected = list(dict.fromkeys(selected))
    enable_port_scan = bool(scan_options.get("enablePortScan", False))
    if not enable_port_scan and PORTS_MODULE in selected:
        selected = [module_name for module_name in selected if module_name != PORTS_MODULE]

    scan = Scan(
        url=member.url,
        domain=urlparse(member.url).hostname or member.url,
        user_id=user_id,
        status=ScanStatus.PENDING,
        total_modules=len(selected),
        scan_options=scan_options,
    )
    db.add(scan)
    db.flush()

    now = datetime.now(timezone.utc)
    skipped_payload = {"skipped": True, "data": {"note": "Skipped by user"}}
    port_scan_skipped_payload = {
        "skipped": True,
        "data": {"note": "Skipped because port scanning is disabled"},
    }
    for module_name in ALL_MODULES:
        if module_name in selected:
            result = ScanModuleResult(
                scan_id=scan.id,
                module_name=module_name,
                status=ModuleStatus.PENDING,
            )
        else:
            payload = (
                port_scan_skipped_payload
                if module_name == PORTS_MODULE and not enable_port_scan
                else skipped_payload
            )
            result = ScanModuleResult(
                scan_id=scan.id,
                module_name=module_name,
                status=ModuleStatus.SUCCESS,
                raw_result=payload,
                duration_ms=0,
                completed_at=now,
            )
        db.add(result)
    db.flush()
    return scan


def _finalize_run_status(run: UrlGroupRun) -> None:
    if run.status == UrlGroupRunStatus.CANCELLED:
        run.completed_at = datetime.now(timezone.utc)
        return
    if run.cancelled_members == run.total_members:
        run.status = UrlGroupRunStatus.CANCELLED
    elif run.cancelled_members > 0:
        run.status = UrlGroupRunStatus.PARTIAL
    elif run.failed_members > 0 and run.completed_members > 0:
        run.status = UrlGroupRunStatus.PARTIAL
    elif run.failed_members > 0 and run.completed_members == 0:
        run.status = UrlGroupRunStatus.FAILED
    else:
        run.status = UrlGroupRunStatus.COMPLETED
    run.completed_at = datetime.now(timezone.utc)


def _mark_member_from_scan(member: UrlGroupRunMember, scan: Scan) -> None:
    if scan.status == ScanStatus.COMPLETED:
        member.status = UrlGroupRunMemberStatus.COMPLETED
    elif scan.status == ScanStatus.CANCELLED:
        member.status = UrlGroupRunMemberStatus.CANCELLED
    else:
        member.status = UrlGroupRunMemberStatus.FAILED
        member.error_message = scan.error_message or "Scan failed"
    member.completed_at = scan.completed_at or datetime.now(timezone.utc)


def _cancel_runnable_members(
    runnable: list[tuple[UrlGroupRunMember, Scan]],
) -> None:
    now = datetime.now(timezone.utc)
    for member, scan in runnable:
        scan.status = ScanStatus.CANCELLED
        scan.completed_at = now
        member.status = UrlGroupRunMemberStatus.CANCELLED
        member.completed_at = now


@celery_app.task(name="process_url_group_run", bind=True, max_retries=1)
def process_url_group_run(
    self,
    run_id: str,
    modules: list[str] | None = None,
    scan_options: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Process queued members in a group run and update aggregate progress."""
    redis = get_redis_sync()
    effective_options = {
        "enablePortScan": False,
        "portScanProfile": DEFAULT_PORT_SCAN_PROFILE,
        "acknowledgeScanAuthorization": False,
        **(scan_options or {}),
    }
    try:
        with _get_sync_session() as db:
            run = db.execute(
                select(UrlGroupRun)
                .where(UrlGroupRun.id == uuid.UUID(run_id))
                .options(selectinload(UrlGroupRun.members))
            ).scalar_one_or_none()
            if run is None:
                return {"run_id": run_id, "status": "not_found"}
            if run.status not in (UrlGroupRunStatus.PENDING, UrlGroupRunStatus.RUNNING):
                return {"run_id": run_id, "status": run.status.value}

            now = datetime.now(timezone.utc)
            db.execute(
                update(UrlGroupRun)
                .where(
                    UrlGroupRun.id == run.id,
                    UrlGroupRun.status == UrlGroupRunStatus.PENDING,
                )
                .values(status=UrlGroupRunStatus.RUNNING, started_at=now)
            )
            db.commit()
            db.refresh(run)
            _publish_progress(redis, run)

            queued_members = [
                member
                for member in sorted(run.members, key=lambda item: item.created_at)
                if member.status == UrlGroupRunMemberStatus.QUEUED
            ]
            concurrency_limit = max(1, int(run.concurrency_limit or 1))
            for batch_start in range(0, len(queued_members), concurrency_limit):
                db.refresh(run)
                if run.status == UrlGroupRunStatus.CANCELLED:
                    break

                batch = queued_members[batch_start : batch_start + concurrency_limit]
                runnable: list[tuple[UrlGroupRunMember, Scan]] = []
                for member in batch:
                    member.status = UrlGroupRunMemberStatus.CREATING_SCAN
                    member.started_at = datetime.now(timezone.utc)
                    _recalculate_counts(run)
                    db.commit()
                    _publish_progress(redis, run)

                    db.refresh(run)
                    if run.status == UrlGroupRunStatus.CANCELLED:
                        member.status = UrlGroupRunMemberStatus.CANCELLED
                        member.completed_at = datetime.now(timezone.utc)
                        continue

                    try:
                        scan = _create_scan_for_member(
                            db,
                            member,
                            run.user_id or 1,
                            modules,
                            effective_options,
                        )
                        member.scan_id = scan.id
                        db.flush()
                        db.refresh(run)
                        if run.status == UrlGroupRunStatus.CANCELLED:
                            scan.status = ScanStatus.CANCELLED
                            scan.completed_at = datetime.now(timezone.utc)
                            member.status = UrlGroupRunMemberStatus.CANCELLED
                            member.completed_at = scan.completed_at
                            continue
                        member.status = UrlGroupRunMemberStatus.RUNNING
                        runnable.append((member, scan))
                    except Exception as exc:
                        logger.exception(
                            "url_group_member_scan_create_failed run_id=%s member_id=%s",
                            run_id,
                            member.id,
                        )
                        member.status = UrlGroupRunMemberStatus.FAILED
                        member.error_message = str(exc)
                        member.completed_at = datetime.now(timezone.utc)

                _recalculate_counts(run)
                db.commit()
                _publish_progress(redis, run)

                db.refresh(run)
                if run.status == UrlGroupRunStatus.CANCELLED:
                    _cancel_runnable_members(runnable)
                    _recalculate_counts(run)
                    db.commit()
                    _publish_progress(redis, run)
                    continue

                with ThreadPoolExecutor(max_workers=concurrency_limit) as executor:
                    future_to_member = {
                        executor.submit(
                            execute_scan.run,
                            str(scan.id),
                            modules,
                            effective_options,
                        ): (member, scan)
                        for member, scan in runnable
                    }
                    for future in as_completed(future_to_member):
                        member, scan = future_to_member[future]
                        try:
                            future.result()
                            db.refresh(scan)
                            _mark_member_from_scan(member, scan)
                        except Exception as exc:
                            logger.exception(
                                "url_group_member_scan_failed run_id=%s member_id=%s",
                                run_id,
                                member.id,
                            )
                            member.status = UrlGroupRunMemberStatus.FAILED
                            member.error_message = str(exc)
                            member.completed_at = datetime.now(timezone.utc)
                        _recalculate_counts(run)
                        db.commit()
                        _publish_progress(redis, run)

            _recalculate_counts(run)
            db.refresh(run)
            _recalculate_counts(run)
            _finalize_run_status(run)
            db.commit()
            _publish_progress(redis, run)
            return {"run_id": run_id, "status": run.status.value}
    except Exception:
        logger.exception("process_url_group_run failed run_id=%s", run_id)
        with _get_sync_session() as db:
            run = db.execute(
                select(UrlGroupRun)
                .where(UrlGroupRun.id == uuid.UUID(run_id))
                .options(selectinload(UrlGroupRun.members))
            ).scalar_one_or_none()
            if run is not None:
                run.status = UrlGroupRunStatus.FAILED
                run.error_message = "Group run orchestration failed"
                run.completed_at = datetime.now(timezone.utc)
                _recalculate_counts(run)
                db.commit()
                _publish_progress(redis, run)
        raise
