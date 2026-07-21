"""URL Group batch scan run service."""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException, ConflictError, NotFoundError, ValidationError
from app.core.redis import get_redis_async
from app.models.scan import Scan, ScanStatus
from app.models.url_group import (
    UrlGroupRun,
    UrlGroupRunMember,
    UrlGroupRunMemberStatus,
    UrlGroupRunStatus,
)
from app.services.operational_event_service import record_event
from app.services import scan_service
from app.services.url_group_service import get_group

logger = logging.getLogger(__name__)

DEFAULT_GROUP_RUN_CONCURRENCY_LIMIT = 3
MAX_GROUP_RUN_CONCURRENCY_LIMIT = 10
GROUP_RUN_PROGRESS_REDIS_TTL_SECONDS = 3600
ACTIVE_GROUP_RUN_STATUSES = (
    UrlGroupRunStatus.PENDING,
    UrlGroupRunStatus.RUNNING,
)
TERMINAL_GROUP_RUN_STATUSES = (
    UrlGroupRunStatus.COMPLETED,
    UrlGroupRunStatus.FAILED,
    UrlGroupRunStatus.CANCELLED,
    UrlGroupRunStatus.PARTIAL,
)
TERMINAL_SCAN_STATUSES = (
    ScanStatus.COMPLETED,
    ScanStatus.FAILED,
    ScanStatus.CANCELLED,
)


def is_run_terminal(run: UrlGroupRun) -> bool:
    return run.status in TERMINAL_GROUP_RUN_STATUSES


def _progress_key(run_id: uuid.UUID | str) -> str:
    return f"url-group-run:{run_id}:progress"


def get_run_progress_percent(run: UrlGroupRun) -> int:
    if run.total_members <= 0:
        return 100 if run.status in TERMINAL_GROUP_RUN_STATUSES else 0
    finished = (
        run.completed_members
        + run.failed_members
        + run.cancelled_members
        + run.skipped_members
    )
    return min(100, int((finished / run.total_members) * 100))


def run_to_dict(run: UrlGroupRun, include_members: bool = True) -> dict[str, Any]:
    members = getattr(run, "members", []) if include_members else []
    return {
        "id": str(run.id),
        "group_id": str(run.group_id),
        "user_id": run.user_id,
        "status": run.status,
        "progress": get_run_progress_percent(run),
        "total_members": run.total_members,
        "queued_members": run.queued_members,
        "running_members": run.running_members,
        "completed_members": run.completed_members,
        "failed_members": run.failed_members,
        "cancelled_members": run.cancelled_members,
        "skipped_members": run.skipped_members,
        "concurrency_limit": run.concurrency_limit,
        "error_message": run.error_message,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "members": [
            {
                "id": str(member.id),
                "group_member_id": str(member.group_member_id),
                "url": member.url,
                "scan_id": str(member.scan_id) if member.scan_id else None,
                "status": member.status,
                "error_message": member.error_message,
                "created_at": member.created_at,
                "started_at": member.started_at,
                "completed_at": member.completed_at,
            }
            for member in members
        ],
    }


async def publish_progress_snapshot(run: UrlGroupRun) -> None:
    payload = run_to_dict(run, include_members=True)
    payload["runId"] = payload["id"]
    payload["groupId"] = payload["group_id"]
    payload["totalMembers"] = payload["total_members"]
    payload["queuedMembers"] = payload["queued_members"]
    payload["runningMembers"] = payload["running_members"]
    payload["completedMembers"] = payload["completed_members"]
    payload["failedMembers"] = payload["failed_members"]
    payload["cancelledMembers"] = payload["cancelled_members"]
    payload["skippedMembers"] = payload["skipped_members"]
    payload["currentUrls"] = [
        member.url
        for member in getattr(run, "members", [])
        if member.status == UrlGroupRunMemberStatus.RUNNING
    ]
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat()

    try:
        redis_client = await get_redis_async()
        try:
            await redis_client.set(_progress_key(run.id), json.dumps(payload, default=str))
            if run.status in TERMINAL_GROUP_RUN_STATUSES:
                await redis_client.expire(
                    _progress_key(run.id),
                    GROUP_RUN_PROGRESS_REDIS_TTL_SECONDS,
                )
        finally:
            await redis_client.aclose()
    except Exception:
        logger.warning(
            "url_group_run_progress_publish_failed run_id=%s",
            run.id,
            exc_info=True,
        )


def _resolve_concurrency_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_GROUP_RUN_CONCURRENCY_LIMIT
    if limit < 1 or limit > MAX_GROUP_RUN_CONCURRENCY_LIMIT:
        raise ValidationError(
            code="INVALID_CONCURRENCY_LIMIT",
            message=(
                "concurrencyLimit must be between 1 and "
                f"{MAX_GROUP_RUN_CONCURRENCY_LIMIT}"
            ),
        )
    return limit


async def _ensure_no_active_run(
    group_id: uuid.UUID,
    db: AsyncSession,
    exclude_run_id: uuid.UUID | None = None,
) -> None:
    filters = [
        UrlGroupRun.group_id == group_id,
        UrlGroupRun.status.in_(ACTIVE_GROUP_RUN_STATUSES),
    ]
    if exclude_run_id is not None:
        filters.append(UrlGroupRun.id != exclude_run_id)
    active_stmt = select(UrlGroupRun).where(*filters)
    if (await db.execute(active_stmt)).scalar_one_or_none():
        raise ConflictError(
            code="GROUP_RUN_ACTIVE",
            message="This group already has an active scan run",
        )


async def _find_recent_completed_scan(
    db: AsyncSession,
    url: str,
    within_seconds: int | None,
) -> Scan | None:
    if within_seconds is None:
        return None
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=within_seconds)
    stmt = (
        select(Scan)
        .where(
            Scan.url == url,
            Scan.status == ScanStatus.COMPLETED,
            Scan.created_at >= cutoff,
        )
        .order_by(desc(Scan.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_group_run(
    group_id: uuid.UUID,
    db: AsyncSession,
    user_id: int | None,
    modules: list[str] | None = None,
    enable_port_scan: bool = False,
    port_scan_profile: str = scan_service.DEFAULT_PORT_SCAN_PROFILE,
    acknowledge_scan_authorization: bool = False,
    concurrency_limit: int | None = None,
    skip_recently_scanned_within_seconds: int | None = None,
) -> UrlGroupRun:
    group = await get_group(group_id, db, include_members=True)
    if not group.members:
        raise ConflictError(
            code="GROUP_HAS_NO_MEMBERS",
            message="Add at least one URL before starting a group scan",
        )

    await _ensure_no_active_run(group_id, db)

    effective_limit = _resolve_concurrency_limit(concurrency_limit)
    members = sorted(group.members, key=lambda member: member.sort_order)
    run = UrlGroupRun(
        group_id=group_id,
        user_id=user_id,
        status=UrlGroupRunStatus.PENDING,
        total_members=len(members),
        queued_members=len(members),
        concurrency_limit=effective_limit,
    )
    db.add(run)
    await db.flush()
    await record_event(
        db,
        event_type="url_group_run.started",
        status="started",
        user_id=user_id,
        group_id=group_id,
        group_run_id=run.id,
        trace_id=str(run.id),
        details={
            "totalMembers": len(members),
            "concurrencyLimit": effective_limit,
            "modules": modules,
            "skipRecentlyScannedWithinSeconds": skip_recently_scanned_within_seconds,
        },
    )

    for member in members:
        recent_scan = await _find_recent_completed_scan(
            db,
            member.url,
            skip_recently_scanned_within_seconds,
        )
        if recent_scan:
            run_member = UrlGroupRunMember(
                run_id=run.id,
                group_member_id=member.id,
                url=member.url,
                scan_id=recent_scan.id,
                status=UrlGroupRunMemberStatus.SKIPPED,
                completed_at=datetime.now(timezone.utc),
                error_message="Skipped because a recent completed scan exists",
            )
            run.skipped_members += 1
            run.queued_members -= 1
            await record_event(
                db,
                event_type="url_group_run.member_skipped",
                status="skipped",
                user_id=user_id,
                target_url=member.url,
                scan_id=recent_scan.id,
                group_id=group_id,
                group_run_id=run.id,
                error_code="RECENT_SCAN_EXISTS",
                message="Skipped because a recent completed scan exists",
                trace_id=str(run.id),
            )
        else:
            run_member = UrlGroupRunMember(
                run_id=run.id,
                group_member_id=member.id,
                url=member.url,
                status=UrlGroupRunMemberStatus.QUEUED,
            )
            await record_event(
                db,
                event_type="url_group_run.member_queued",
                status="started",
                user_id=user_id,
                target_url=member.url,
                group_id=group_id,
                group_run_id=run.id,
                trace_id=str(run.id),
            )
        db.add(run_member)

    if run.queued_members == 0:
        run.status = UrlGroupRunStatus.COMPLETED
        run.started_at = datetime.now(timezone.utc)
        run.completed_at = run.started_at

    await db.flush()
    await db.refresh(run, attribute_names=["members"])
    logger.info("url_group_run_created", group_id=str(group_id), run_id=str(run.id))
    return run


async def get_group_run(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    db: AsyncSession,
    user_id: int | None = None,
) -> UrlGroupRun:
    filters = [UrlGroupRun.id == run_id, UrlGroupRun.group_id == group_id]
    if user_id is not None:
        filters.append(UrlGroupRun.user_id == user_id)
    stmt = select(UrlGroupRun).where(*filters).options(
        selectinload(UrlGroupRun.members)
    )
    run = (await db.execute(stmt)).scalar_one_or_none()
    if run is None:
        raise NotFoundError(
            code="GROUP_RUN_NOT_FOUND",
            message=f"Group run {run_id} not found",
        )
    return run


async def list_group_runs(
    group_id: uuid.UUID,
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    user_id: int | None = None,
) -> tuple[list[UrlGroupRun], int]:
    await get_group(group_id, db, include_members=False)
    filters = [UrlGroupRun.group_id == group_id]
    if user_id is not None:
        filters.append(UrlGroupRun.user_id == user_id)
    count_stmt = select(func.count()).select_from(UrlGroupRun).where(*filters)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        select(UrlGroupRun)
        .where(*filters)
        .options(selectinload(UrlGroupRun.members))
        .order_by(desc(UrlGroupRun.created_at))
        .offset(skip)
        .limit(limit)
    )
    runs = list((await db.execute(stmt)).scalars().all())
    return runs, total


async def cancel_group_run(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    db: AsyncSession,
    user_id: int | None = None,
) -> UrlGroupRun:
    run = await get_group_run(group_id, run_id, db, user_id=user_id)
    if run.status not in ACTIVE_GROUP_RUN_STATUSES:
        raise ConflictError(
            code="GROUP_RUN_NOT_CANCELLABLE",
            message=f"Group run is already {run.status.value}",
        )

    now = datetime.now(timezone.utc)
    for member in run.members:
        if member.status == UrlGroupRunMemberStatus.QUEUED:
            member.status = UrlGroupRunMemberStatus.CANCELLED
            member.completed_at = now
        elif member.status in (
            UrlGroupRunMemberStatus.CREATING_SCAN,
            UrlGroupRunMemberStatus.RUNNING,
        ):
            if member.scan_id:
                try:
                    await scan_service.cancel_scan(db, member.scan_id, user_id=user_id)
                except AppException:
                    logger.info(
                        "url_group_member_scan_already_terminal",
                        scan_id=str(member.scan_id),
                    )
            member.status = UrlGroupRunMemberStatus.CANCELLED
            member.completed_at = now

    await recalculate_run_counts(run)
    run.status = UrlGroupRunStatus.CANCELLED
    run.completed_at = now
    await record_event(
        db,
        event_type="url_group_run.cancelled",
        status="cancelled",
        user_id=user_id,
        group_id=group_id,
        group_run_id=run.id,
        trace_id=str(run.id),
        details={
            "cancelledMembers": run.cancelled_members,
            "queuedMembers": run.queued_members,
            "runningMembers": run.running_members,
        },
    )
    await db.flush()
    await publish_progress_snapshot(run)
    return run


async def retry_failed_group_run(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    db: AsyncSession,
    user_id: int | None,
    modules: list[str] | None = None,
    enable_port_scan: bool = False,
    port_scan_profile: str = scan_service.DEFAULT_PORT_SCAN_PROFILE,
    acknowledge_scan_authorization: bool = False,
    concurrency_limit: int | None = None,
) -> UrlGroupRun:
    source_run = await get_group_run(group_id, run_id, db, user_id=user_id)
    if source_run.status in ACTIVE_GROUP_RUN_STATUSES:
        raise ConflictError(
            code="GROUP_RUN_ACTIVE",
            message="Wait for the active group run to finish before retrying failed members",
        )
    await _ensure_no_active_run(group_id, db, exclude_run_id=source_run.id)
    failed_members = [
        member
        for member in source_run.members
        if member.status == UrlGroupRunMemberStatus.FAILED
    ]
    if not failed_members:
        raise ConflictError(
            code="NO_FAILED_MEMBERS",
            message="This group run has no failed members to retry",
        )

    effective_limit = _resolve_concurrency_limit(concurrency_limit)
    retry_run = UrlGroupRun(
        group_id=group_id,
        user_id=user_id,
        status=UrlGroupRunStatus.PENDING,
        total_members=len(failed_members),
        queued_members=len(failed_members),
        concurrency_limit=effective_limit,
    )
    db.add(retry_run)
    await db.flush()
    for failed_member in failed_members:
        db.add(
            UrlGroupRunMember(
                run_id=retry_run.id,
                group_member_id=failed_member.group_member_id,
                url=failed_member.url,
                status=UrlGroupRunMemberStatus.QUEUED,
            )
        )
    await db.flush()
    await db.refresh(retry_run, attribute_names=["members"])
    await record_event(
        db,
        event_type="url_group_run.retry_created",
        status="retrying",
        user_id=user_id,
        group_id=group_id,
        group_run_id=retry_run.id,
        retry_count=1,
        trace_id=str(retry_run.id),
        details={
            "sourceRunId": str(source_run.id),
            "failedMembers": len(failed_members),
            "concurrencyLimit": effective_limit,
        },
    )
    logger.info(
        "url_group_failed_members_retry_created",
        group_id=str(group_id),
        source_run_id=str(run_id),
        retry_run_id=str(retry_run.id),
    )
    return retry_run


async def recalculate_run_counts(run: UrlGroupRun) -> None:
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


async def refresh_group_run_from_scans(run: UrlGroupRun) -> None:
    now = datetime.now(timezone.utc)
    for member in run.members:
        if member.status not in (
            UrlGroupRunMemberStatus.RUNNING,
            UrlGroupRunMemberStatus.CREATING_SCAN,
        ):
            continue
        scan = None
        if member.scan_id:
            scan = getattr(member, "scan", None)
        if scan is None or scan.status not in TERMINAL_SCAN_STATUSES:
            continue
        if scan.status == ScanStatus.COMPLETED:
            member.status = UrlGroupRunMemberStatus.COMPLETED
        elif scan.status == ScanStatus.CANCELLED:
            member.status = UrlGroupRunMemberStatus.CANCELLED
        else:
            member.status = UrlGroupRunMemberStatus.FAILED
            member.error_message = scan.error_message
        member.completed_at = scan.completed_at or now
    await recalculate_run_counts(run)
