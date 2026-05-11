"""Monitor CRUD, checks, series, changes, SSL, and SSE."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.monitor import (
    MaintenanceRecurrenceSpec,
    MaintenanceWindowResponse,
    MonitorBaselineResponse,
    MonitorBulkActionFailure,
    MonitorBulkActionRequest,
    MonitorBulkActionResponse,
    MonitorChangeResponse,
    MonitorCheckResponse,
    MonitorCreateRequest,
    MonitorCtEntryResponse,
    MonitorDiffResponse,
    MonitorDnsChangeResponse,
    MonitorDnsRecordResponse,
    MonitorResponse,
    MonitorSslStatusResponse,
    MonitorTimeSeriesData,
    MonitorUpdateRequest,
    MonitorUptimeSummaryResponse,
    MonitorVisualCaptureResponse,
    MonitorVisualChangeResponse,
)
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user, get_db, get_redis
from app.core.exceptions import AppException
from app.services import (
    ct_log_service,
    dns_monitor_service,
    maintenance_window_service,
    monitor_service,
)

router = APIRouter(prefix="/monitors", tags=["monitors"])


@router.get("/{monitor_id}/stream")
async def monitor_event_stream(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """SSE: Redis Pub/Sub monitor events + heartbeat."""
    row = await monitor_service.get_monitor(monitor_id, current_user.id, db)
    _ = row
    return StreamingResponse(
        monitor_service.stream_monitor_channel(monitor_id, redis),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/live")
async def monitors_live_stream(
    current_user: CurrentUser = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """SSE: all monitor events for the current user (unnamed messages for EventSource.onmessage)."""
    return StreamingResponse(
        monitor_service.stream_user_monitors_live(current_user.id, redis),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("", response_model=SuccessResponse[list[MonitorResponse]])
async def list_monitors(
    current_user: CurrentUser = Depends(get_current_user),
    status: str | None = Query(None),
    search: str | None = Query(None),
    # Phase 1.3: repeated tags + tag_match (any|all). FastAPI parses
    # `?tags=foo&tags=bar` into a list when the type is `list[str]`.
    tags: list[str] | None = Query(None),
    tag_match: str = Query(
        "any",
        pattern="^(any|all)$",
        description="Use 'any' for OR-of-tags (default) or 'all' for AND.",
    ),
    # Phase 1.4: sort + latency / uptime filters.
    sort: str | None = Query(
        None,
        description=(
            "Sort spec '<field>:<asc|desc>'. Allowed fields: createdAt, "
            "updatedAt, displayName, lastCheckAt, lastResponseTimeMs, "
            "uptimePercentage. Defaults to createdAt:desc."
        ),
    ),
    latency_max_ms: float | None = Query(
        None,
        ge=0,
        description="Keep monitors with last_response_time_ms <= this value.",
    ),
    uptime_min_percent: float | None = Query(
        None,
        ge=0,
        le=100,
        description="Keep monitors with uptime_percentage >= this value.",
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await monitor_service.list_monitors(
        user_id=current_user.id,
        status=status,
        search=search,
        page=page,
        limit=limit,
        db=db,
        tags=tags,
        tag_match=tag_match,
        sort=sort,
        latency_max_ms=latency_max_ms,
        uptime_min_percent=uptime_min_percent,
    )
    return SuccessResponse(data=data, meta=meta)


@router.post("", status_code=201, response_model=SuccessResponse[MonitorResponse])
async def create_monitor(
    request: MonitorCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await monitor_service.create_monitor(current_user.id, request, db)
    await db.commit()
    return SuccessResponse(data=row)

@router.post(
    "/bulk",
    response_model=SuccessResponse[MonitorBulkActionResponse],
    summary="Apply an action to many monitors in one request",
    description=(
        "Bulk pause/resume/enable/disable/delete. Per-row errors are returned in "
        "`data.failed` so partial failures don't abort the whole batch."
    ),
)
async def bulk_act_on_monitors(
    request: MonitorBulkActionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    succeeded, failures = await monitor_service.bulk_act_on_monitors(
        current_user.id,
        request.action,
        list(request.monitor_ids),
        db,
    )
    if succeeded:
        await db.commit()
    payload = MonitorBulkActionResponse(
        action=request.action,
        succeeded=succeeded,
        failed=[MonitorBulkActionFailure(**f) for f in failures],
        requested=len(request.monitor_ids),
    )
    return SuccessResponse(data=payload)


@router.get("/{monitor_id}", response_model=SuccessResponse[MonitorResponse])
async def get_monitor(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await monitor_service.get_monitor(monitor_id, current_user.id, db)
    return SuccessResponse(data=row)


@router.put("/{monitor_id}", response_model=SuccessResponse[MonitorResponse])
async def update_monitor(
    monitor_id: uuid.UUID,
    request: MonitorUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await monitor_service.update_monitor(monitor_id, current_user.id, request, db)
    await db.commit()
    return SuccessResponse(data=row)


@router.delete("/{monitor_id}", response_model=SuccessResponse[dict])
async def delete_monitor(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await monitor_service.delete_monitor(monitor_id, current_user.id, db)
    await db.commit()
    return SuccessResponse(data={})


@router.patch("/{monitor_id}/pause", response_model=SuccessResponse[MonitorResponse])
async def pause_monitor(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await monitor_service.pause_monitor(monitor_id, current_user.id, db)
    await db.commit()
    return SuccessResponse(data=row)


@router.patch("/{monitor_id}/resume", response_model=SuccessResponse[MonitorResponse])
async def resume_monitor(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await monitor_service.resume_monitor(monitor_id, current_user.id, db)
    await db.commit()
    return SuccessResponse(data=row)


@router.post("/{monitor_id}/check", response_model=SuccessResponse[MonitorCheckResponse])
async def trigger_check(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    row = await monitor_service.trigger_manual_check(
        monitor_id, current_user.id, db, redis
    )
    await db.commit()
    return SuccessResponse(data=row)


@router.get("/{monitor_id}/checks", response_model=SuccessResponse[list[MonitorCheckResponse]])
async def get_checks(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    period: str | None = Query(None, pattern="^(24h|7d|30d|90d)$"),
    success: bool | None = Query(None),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await monitor_service.get_checks(
        monitor_id,
        current_user.id,
        page,
        limit,
        db,
        period=period,
        success=success,
        sort=sort,
    )
    return SuccessResponse(data=data, meta=meta)


@router.get(
    "/{monitor_id}/series",
    response_model=SuccessResponse[MonitorTimeSeriesData],
)
async def get_time_series(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    period: str = Query("24h", pattern="^(24h|7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
):
    data = await monitor_service.get_time_series(monitor_id, current_user.id, period, db)
    return SuccessResponse(data=data)


@router.get("/{monitor_id}/uptime", response_model=SuccessResponse[MonitorUptimeSummaryResponse])
async def get_uptime_summary(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    period: str = Query("24h", pattern="^(24h|7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
):
    data = await monitor_service.get_uptime_summary(
        monitor_id, current_user.id, period, db
    )
    return SuccessResponse(data=data)


@router.get(
    "/{monitor_id}/changes",
    response_model=SuccessResponse[list[MonitorChangeResponse]],
    summary="List content changes",
    description=(
        "Paginated history of **content_change** detections for the monitor. "
        "Each row includes `diffSummary` with `changeCategory` derived from server "
        "`CHANGE_CATEGORY_SMALL_MAX` / `CHANGE_CATEGORY_MEDIUM_MAX` (total diff lines). "
        "JSON uses camelCase (e.g. `snapshotBeforeId`). See shared constants "
        "`monitor-change-categories.ts` for default thresholds when mirroring filters in clients."
    ),
)
async def get_changes(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    page: int = Query(1, ge=1, description="1-based page index"),
    limit: int = Query(20, ge=1, le=100, description="Page size (max 100)"),
    period: str | None = Query(
        None,
        pattern="^(24h|7d|30d|90d)$",
        description="Only changes with detectedAt >= now - period (UTC). Omit for all time.",
    ),
    category: str | None = Query(
        None,
        pattern="^(small|medium|large)$",
        description="Filter by stored diffSummary.changeCategory",
    ),
    sort: str = Query(
        "desc",
        pattern="^(asc|desc)$",
        description="Sort by detectedAt",
    ),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await monitor_service.get_changes(
        monitor_id,
        current_user.id,
        page,
        limit,
        db,
        period=period,
        category=category,
        sort=sort,
    )
    return SuccessResponse(data=data, meta=meta)


@router.get(
    "/{monitor_id}/changes/export.csv",
    summary="Export content changes as CSV",
    description=(
        "Same filters as GET /changes where applicable. "
        "Max rows capped by server (MONITOR_CHANGES_EXPORT_MAX_ROWS). "
        "diffUrl column is an API-relative path (prepend deployment origin)."
    ),
    response_class=Response,
)
async def export_monitor_changes_csv(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    period: str | None = Query(
        None,
        pattern="^(24h|7d|30d|90d)$",
        description="Only changes with detectedAt >= now - period (UTC). Omit for all time.",
    ),
    category: str | None = Query(
        None,
        pattern="^(small|medium|large)$",
        description="Filter by stored diffSummary.changeCategory",
    ),
    sort: str = Query("desc", pattern="^(asc|desc)$", description="Sort by detectedAt"),
    limit: int = Query(2000, ge=1, le=5000, description="Max rows (server may cap lower)"),
    db: AsyncSession = Depends(get_db),
):
    body, filename = await monitor_service.export_monitor_changes_csv(
        monitor_id,
        current_user.id,
        db,
        period=period,
        category=category,
        sort=sort,
        limit=limit,
    )
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/{monitor_id}/changes/export.pdf",
    summary="Export content changes audit PDF (optional)",
    description="Requires MONITOR_CHANGES_EXPORT_PDF_ENABLED. Returns 404 when disabled.",
    response_class=Response,
)
async def export_monitor_changes_pdf(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    period: str | None = Query(
        None,
        pattern="^(24h|7d|30d|90d)$",
    ),
    category: str | None = Query(
        None,
        pattern="^(small|medium|large)$",
    ),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(2000, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
):
    body, filename = await monitor_service.export_monitor_changes_pdf(
        monitor_id,
        current_user.id,
        db,
        period=period,
        category=category,
        sort=sort,
        limit=limit,
    )
    return Response(
        content=body,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/{monitor_id}/content/baseline",
    response_model=SuccessResponse[MonitorBaselineResponse | None],
)
async def get_content_baseline(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await monitor_service.get_baseline_snapshot(
        monitor_id, current_user.id, db
    )
    return SuccessResponse(data=data)


@router.get("/{monitor_id}/snapshots/{snapshot_id}/raw")
async def get_snapshot_raw(
    monitor_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    snap = await monitor_service.get_snapshot_raw_for_owner(
        monitor_id, snapshot_id, current_user.id, db
    )
    media = snap.content_type or "text/html; charset=utf-8"
    body = snap.content.encode("utf-8", errors="replace")
    chunk_size = 64 * 1024

    async def body_chunks():
        # NOTE: Row is fully loaded from DB (TEXT). Chunking only bounds
        # outbound buffer size; end-to-end streaming needs object storage.
        for i in range(0, len(body), chunk_size):
            yield body[i : i + chunk_size]

    return StreamingResponse(
        body_chunks(),
        media_type=media,
        headers={
            "Content-Disposition": (
                f'inline; filename="snapshot-{snapshot_id}.html"'
            ),
            "Content-Length": str(len(body)),
        },
    )


@router.get(
    "/{monitor_id}/changes/{change_id}/diff",
    response_model=SuccessResponse[MonitorDiffResponse],
    summary="Get unified HTML diff for a content change",
    description=(
        "Loads snapshot HTML before/after the change and returns `diffHtml`, `unifiedDiff`, "
        "and optional truncation flags when snapshots exceed `MONITOR_DIFF_MAX_CHARS_PER_SIDE`. "
        "**404 CHANGE_NOT_FOUND** — change id invalid or wrong monitor. "
        "**404 SNAPSHOT_NOT_FOUND** — snapshot bodies were purged by retention; metadata only."
    ),
)
async def get_change_diff(
    monitor_id: uuid.UUID,
    change_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await monitor_service.get_change_diff(
        monitor_id, change_id, current_user.id, db
    )
    return SuccessResponse(data=data)


@router.get(
    "/{monitor_id}/visual/captures",
    response_model=SuccessResponse[list[MonitorVisualCaptureResponse]],
    summary="List visual screenshots",
)
async def list_visual_captures(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    period: str | None = Query(None, pattern="^(24h|7d|30d|90d)$"),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await monitor_service.get_visual_captures(
        monitor_id,
        current_user.id,
        page,
        limit,
        db,
        period=period,
        sort=sort,
    )
    return SuccessResponse(data=data, meta=meta)


@router.post(
    "/{monitor_id}/visual/captures/now",
    response_model=SuccessResponse[MonitorVisualCaptureResponse],
    summary="Trigger a synchronous visual capture (V-2)",
    description=(
        "Forces an immediate screenshot via the scan service so the operator "
        "can establish a baseline even when the periodic check has been "
        "failing (Cloudflare interstitial, 5xx, TLS handshake error). "
        "Rate-limited per monitor — see `MONITOR_VISUAL_CAPTURE_NOW_*` "
        "settings."
    ),
)
async def trigger_visual_capture_now(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    capture = await monitor_service.trigger_visual_capture_now(
        monitor_id, current_user.id, db, redis
    )
    await db.commit()
    return SuccessResponse(data=capture)


@router.get(
    "/{monitor_id}/visual/captures/{capture_id}/png",
    summary="Download capture PNG (authenticated)",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
async def get_visual_capture_png(
    monitor_id: uuid.UUID,
    capture_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body, _cap = await monitor_service.get_visual_capture_png_for_owner(
        monitor_id, capture_id, current_user.id, db
    )
    return Response(
        content=body,
        media_type="image/png",
        headers={
            "Cache-Control": "private, max-age=3600",
            "Content-Length": str(len(body)),
        },
    )


@router.get(
    "/{monitor_id}/visual/changes",
    response_model=SuccessResponse[list[MonitorVisualChangeResponse]],
    summary="List visual change events (perceptual hash)",
)
async def list_visual_changes(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    period: str | None = Query(None, pattern="^(24h|7d|30d|90d)$"),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await monitor_service.get_visual_changes(
        monitor_id,
        current_user.id,
        page,
        limit,
        db,
        period=period,
        sort=sort,
    )
    return SuccessResponse(data=data, meta=meta)


@router.get("/{monitor_id}/ssl", response_model=SuccessResponse[MonitorSslStatusResponse])
async def get_ssl_status(
    monitor_id: uuid.UUID,
    live: bool = Query(False, description="Force immediate TLS probe (rate-limited)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    if live:
        cooldown_key = f"monitor:ssl_live:{monitor_id}"
        if await redis.exists(cooldown_key):
            raise AppException(
                code="SSL_PROBE_RATE_LIMITED",
                message="Please wait before triggering another live SSL probe",
                status_code=429,
            )
        await redis.setex(
            cooldown_key,
            settings.SSL_LIVE_PROBE_COOLDOWN_SECONDS,
            "1",
        )
    data = await monitor_service.get_ssl_status(
        monitor_id, current_user.id, db, live=live
    )
    if live:
        await db.commit()
    return SuccessResponse(data=data)


# ── Phase 2.2 — DNS change ────────────────────────────────────────────


def _dns_record_to_response(row) -> MonitorDnsRecordResponse:
    return MonitorDnsRecordResponse(
        id=str(row.id),
        monitor_id=str(row.monitor_id),
        record_type=row.record_type,
        values=list(row.values or []),
        observed_at=row.observed_at,
        last_change_at=row.last_change_at,
    )


def _dns_change_to_response(row) -> MonitorDnsChangeResponse:
    return MonitorDnsChangeResponse(
        id=str(row.id),
        monitor_id=str(row.monitor_id),
        record_type=row.record_type,
        detected_at=row.detected_at,
        previous_values=list(row.previous_values or []),
        current_values=list(row.current_values or []),
        added_values=list(row.added_values or []),
        removed_values=list(row.removed_values or []),
    )


@router.get(
    "/{monitor_id}/dns/records",
    response_model=SuccessResponse[list[MonitorDnsRecordResponse]],
)
async def list_dns_records(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await monitor_service.get_monitor(monitor_id, current_user.id, db)
    rows = await dns_monitor_service.list_dns_records(monitor_id, db)
    return SuccessResponse(data=[_dns_record_to_response(r) for r in rows])


@router.get(
    "/{monitor_id}/dns/changes",
    response_model=SuccessResponse[list[MonitorDnsChangeResponse]],
)
async def list_dns_changes(
    monitor_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await monitor_service.get_monitor(monitor_id, current_user.id, db)
    offset = (page - 1) * limit
    rows = await dns_monitor_service.list_dns_changes(
        monitor_id, db, limit=limit, offset=offset
    )
    return SuccessResponse(data=[_dns_change_to_response(r) for r in rows])


# ── Phase 2.3 — CT log ────────────────────────────────────────────────


def _ct_entry_to_response(row) -> MonitorCtEntryResponse:
    return MonitorCtEntryResponse(
        id=str(row.id),
        monitor_id=str(row.monitor_id),
        hostname=row.hostname,
        serial_number=row.serial_number,
        leaf_sha256=row.leaf_sha256,
        issuer_name=row.issuer_name,
        common_name=row.common_name,
        not_before=row.not_before,
        not_after=row.not_after,
        observed_at=row.observed_at,
        crtsh_id=row.crtsh_id,
        pin_violation=row.pin_violation,
        alerted_at=row.alerted_at,
    )


@router.get(
    "/{monitor_id}/ct/entries",
    response_model=SuccessResponse[list[MonitorCtEntryResponse]],
)
async def list_ct_entries(
    monitor_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await monitor_service.get_monitor(monitor_id, current_user.id, db)
    offset = (page - 1) * limit
    rows = await ct_log_service.list_ct_entries(
        monitor_id, db, limit=limit, offset=offset
    )
    return SuccessResponse(data=[_ct_entry_to_response(r) for r in rows])


# ── Phase 2b — Active maintenance windows for a monitor ──────────────


@router.get(
    "/{monitor_id}/maintenance/active",
    response_model=SuccessResponse[list[MaintenanceWindowResponse]],
)
async def list_active_maintenance_windows(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return maintenance windows currently in effect for this monitor.

    The monitor detail page uses this to render an "in maintenance" banner
    and short-circuit alerting expectations.
    """
    monitor = await monitor_service.get_monitor(monitor_id, current_user.id, db)
    summaries = await maintenance_window_service.list_active_windows(
        current_user.id,
        monitor_id,
        db,
        monitor_tags=list(monitor.tags or []),
    )
    if not summaries:
        return SuccessResponse(data=[])
    rows = await maintenance_window_service.list_windows_for_user(
        current_user.id,
        db,
        monitor_id=monitor_id,
        include_disabled=False,
    )
    by_id = {row.id: row for row in rows}
    out: list[MaintenanceWindowResponse] = []
    for summary in summaries:
        row = by_id.get(summary.id)
        if row is None:
            continue
        rec = (
            MaintenanceRecurrenceSpec.model_validate(row.recurrence)
            if row.recurrence
            else None
        )
        out.append(
            MaintenanceWindowResponse(
                id=str(row.id),
                user_id=row.user_id,
                monitor_id=str(row.monitor_id) if row.monitor_id else None,
                title=row.title,
                # Surface the *occurrence* range (recurrence-aware) so the UI
                # can show "ends at 03:00" instead of the original date.
                starts_at=summary.starts_at,
                ends_at=summary.ends_at,
                suppress_alerts=row.suppress_alerts,
                suppress_probes=row.suppress_probes,
                is_enabled=row.is_enabled,
                notes=row.notes,
                recurrence=rec,
                tag_scope=list(row.tag_scope) if row.tag_scope else None,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
    return SuccessResponse(data=out)
