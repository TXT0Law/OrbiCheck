import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.scan import (
    ScanCreateRequest,
    ScanDetailResponse,
    ScanListResponse,
    ScanResponse,
)
from app.core.deps import CurrentUser, get_current_user, get_db
from app.core.config import settings
from app.core.redis import get_redis_async
from app.services import scan_service, scan_trend
from app.services.recommendations import generate_recommendations
from app.services.scan_trend import (
    DEFAULT_TIMELINE_LIMIT,
    DIFF_KEY_FINDINGS_LIMIT,
    MAX_TIMELINE_LIMIT,
    TimelineRange,
    compute_scan_diff,
)
from app.services.security_analyzer import (
    compute_category_summary,
    compute_severity_counts,
    extract_key_findings,
    resolve_security_score_for_detail,
)
from app.services.transformers import (
    MODULE_TO_FRONTEND_KEY,
    build_module_errors,
    build_module_jobs,
    build_scan_detail,
)
from app.tasks.scan_tasks import execute_scan

router = APIRouter(prefix="/scans", tags=["scans"])
logger = logging.getLogger(__name__)

PROGRESS_KEY_TTL_SECONDS = 3600


def _sse_progress_payload_is_terminal(data: dict) -> bool:
    """True when scan progress semantics have ended (success, fatal, or cancel)."""
    if not isinstance(data, dict):
        return False
    return (
        data.get("progress", 0) >= 100
        or data.get("error") is True
        or data.get("done") is True
        or data.get("cancelled") is True
        or data.get("phase") == "error"
        or data.get("phase") == "cancelled"
    )


@router.post("/{scan_id}/rescan", response_model=SuccessResponse[ScanResponse])
async def rescan(
    scan_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Re-run a scan on the same URL using the existing scan record.

    Resets status, clears module results, re-enqueues the Celery task.
    Does NOT create a new scan record.
    Only allowed on terminal-state scans (completed, failed, cancelled).
    """
    scan = await scan_service.rescan(
        db,
        scan_id,
        background_tasks,
        user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(scan)
    return SuccessResponse(data=ScanResponse.model_validate(scan))


@router.post("", status_code=201, response_model=SuccessResponse[ScanResponse])
async def create_scan(
    request: ScanCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new scan and start async execution."""
    scan = await scan_service.create_scan(
        db,
        request.url,
        request.modules,
        user_id=current_user.id,
        enable_port_scan=request.enable_port_scan,
        port_scan_profile=request.port_scan_profile,
        acknowledge_scan_authorization=request.acknowledge_scan_authorization,
    )
    await db.commit()
    await db.refresh(scan)

    scan_id = str(scan.id)
    modules_arg = request.modules if request.modules else None
    scan_options_arg = {
        "enablePortScan": request.enable_port_scan,
        "portScanProfile": request.port_scan_profile,
        "acknowledgeScanAuthorization": request.acknowledge_scan_authorization,
    }

    if settings.APP_ENV.lower() == "development":
        background_tasks.add_task(execute_scan.run, scan_id, modules_arg, scan_options_arg)
    else:
        task = execute_scan.delay(scan_id, modules_arg, scan_options_arg)
        scan.celery_task_id = task.id if task else None
        await db.commit()
        await db.refresh(scan)

    return SuccessResponse(data=ScanResponse.model_validate(scan))


@router.get("", response_model=SuccessResponse[ScanListResponse])
async def list_scans(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None),
    sort_by: Literal[
        "created_at_desc",
        "created_at_asc",
        "security_score_desc",
        "security_score_asc",
        "domain_asc",
        "domain_desc",
        "progress_desc",
    ] = Query(default="created_at_desc"),
    status_group: Literal[
        "all",
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "active",
        "terminal",
    ] = Query(default="all"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all scans with pagination."""
    scans, total = await scan_service.list_scans(
        db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        search=search,
        sort_by=sort_by,
        status_group=status_group,
    )
    return SuccessResponse(
        data=ScanListResponse(
            scans=[ScanResponse.model_validate(s) for s in scans],
            total=total,
        ),
        meta={
            "limit": limit,
            "offset": offset,
            "search": search,
            "sortBy": sort_by,
            "statusGroup": status_group,
        },
    )


@router.delete("", response_model=SuccessResponse[dict])
async def delete_all_scans(
    search: str | None = Query(default=None),
    status_group: Literal[
        "all",
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "active",
        "terminal",
    ] = Query(default="all"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete scans, optionally constrained by the same list filters."""
    deleted = await scan_service.delete_scans(
        db,
        user_id=current_user.id,
        search=search,
        status_group=status_group,
    )
    await db.commit()
    return SuccessResponse(data={"deleted": deleted})


@router.get("/by-domain/{domain}/timeline")
async def get_domain_timeline(
    domain: str,
    range: TimelineRange = Query(default="all", alias="range"),
    limit: int = Query(
        default=DEFAULT_TIMELINE_LIMIT,
        ge=1,
        le=MAX_TIMELINE_LIMIT,
    ),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return owner-scoped scan history for a domain ordered oldest → newest.

    Backs the Trend page (T5.1): the dashboard plots one line for security
    score and one for total severity counts, so the chart tooltip must keep
    track of both. The endpoint deliberately filters on terminal statuses
    only so partial / pending scans do not skew the trend.

    Registered BEFORE the ``/{scan_id}`` catch-all so requests like
    ``GET /scans/by-domain/example.com/timeline`` do not get matched as a
    scan id and rejected by the UUID validator.
    """
    points = await scan_trend.get_domain_timeline(
        db,
        user_id=current_user.id,
        domain=domain,
        time_range=range,
        limit=limit,
    )
    return SuccessResponse(
        data={"domain": domain, "points": points},
        meta={"range": range, "limit": limit, "count": len(points)},
    )


@router.get("/diff")
async def diff_two_scans(
    base_id: uuid.UUID = Query(alias="baseId"),
    compare_id: uuid.UUID = Query(alias="compareId"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare two owner-scoped scans (T5.2).

    Both scans are fetched with owner enforcement (``scan_service.get_scan``
    raises ``ScanNotFoundError`` → 404 when the user mismatches), so a user
    cannot diff someone else's scan even by guessing IDs. Registered BEFORE
    the ``/{scan_id}`` catch-all so the literal ``/scans/diff`` path is not
    eaten by the UUID validator.
    """
    base_scan = await scan_service.get_scan(db, base_id, current_user.id)
    compare_scan = await scan_service.get_scan(db, compare_id, current_user.id)

    diff = compute_scan_diff(
        base_scan,
        compare_scan,
        key_findings_limit=DIFF_KEY_FINDINGS_LIMIT,
    )
    return SuccessResponse(
        data={
            **diff,
            "baseDomain": base_scan.domain,
            "compareDomain": compare_scan.domain,
            "baseCompletedAt": (
                base_scan.completed_at.isoformat()
                if base_scan.completed_at
                else None
            ),
            "compareCompletedAt": (
                compare_scan.completed_at.isoformat()
                if compare_scan.completed_at
                else None
            ),
            "baseScore": (
                int(base_scan.security_score)
                if base_scan.security_score is not None
                else None
            ),
            "compareScore": (
                int(compare_scan.security_score)
                if compare_scan.security_score is not None
                else None
            ),
        }
    )


@router.get("/{scan_id}", response_model=SuccessResponse[ScanDetailResponse])
async def get_scan(
    scan_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a scan with all module results."""
    scan = await scan_service.get_scan(db, scan_id, current_user.id)
    return SuccessResponse(data=ScanDetailResponse.model_validate(scan))


@router.get("/{scan_id}/modules/{module_name}")
async def get_scan_module(
    scan_id: uuid.UUID,
    module_name: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific module result, transformed for frontend consumption."""
    scan = await scan_service.get_scan(db, scan_id, current_user.id)
    module_result = next((m for m in scan.module_results if m.module_name == module_name), None)
    if not module_result:
        return SuccessResponse(data=None)

    all_raw = {
        m.module_name: m.raw_result
        for m in scan.module_results
        if m.raw_result is not None
    }
    detail = build_scan_detail(str(scan.id), scan.url, all_raw)

    frontend_key = MODULE_TO_FRONTEND_KEY.get(module_name, module_name)
    transformed_data = detail.get(frontend_key) if frontend_key else module_result.raw_result

    return SuccessResponse(
        data={
            "module": module_name,
            "status": module_result.status.value,
            "data": transformed_data,
            "durationMs": module_result.duration_ms,
        }
    )


# Default cap for surfaced findings on detail / export endpoints. Mirrors
# `KEY_FINDINGS_DISPLAY_LIMIT` on the Web Summary so live and exported
# payloads agree on top-N findings.
DETAIL_KEY_FINDINGS_LIMIT = 8


def _compose_scan_detail_payload(scan, *, key_findings_limit: int) -> dict:
    """Assemble the canonical scan-detail dict shared by ``/detail`` and ``/detail/full``.

    Pulls every transformer + analyzer once so both endpoints stay in lockstep
    (G7 / D0-1: single source of truth for ``securityScoreBreakdown`` shape).
    """
    all_raw = {
        m.module_name: m.raw_result
        for m in scan.module_results
        if m.raw_result is not None
    }
    detail = build_scan_detail(str(scan.id), scan.url, all_raw)
    module_errors = build_module_errors(scan.module_results)
    module_jobs, total_duration_ms = build_module_jobs(
        list(scan.module_results), scan
    )

    severity = compute_severity_counts(all_raw)
    category_summary = compute_category_summary(all_raw)
    key_findings = extract_key_findings(all_raw, max_findings=key_findings_limit)
    recommendations = generate_recommendations(detail, key_findings)

    resolved_security = resolve_security_score_for_detail(
        stored_score=scan.security_score,
        scan_status=scan.status,
        module_results=scan.module_results,
        all_raw=all_raw,
    )

    data: dict = {
        "id": str(scan.id),
        "domain": scan.domain,
        "url": scan.url,
        "scannedAt": scan.started_at.isoformat() if scan.started_at else None,
        "duration": (
            f"{(scan.completed_at - scan.started_at).total_seconds():.1f}s"
            if scan.completed_at and scan.started_at
            else None
        ),
        "status": scan.status.value,
        "securityScore": resolved_security.score,
        "severity": severity,
        "categorySummary": category_summary,
        "keyFindings": key_findings,
        "recommendations": recommendations,
        "moduleErrors": module_errors,
        "moduleJobs": module_jobs,
        "totalDurationMs": total_duration_ms,
        **detail,
    }
    if resolved_security.breakdown is not None:
        cs = resolved_security.breakdown.category_scores
        data["securityScoreBreakdown"] = {
            "baseScore": resolved_security.breakdown.base_score,
            "confidence": resolved_security.breakdown.confidence,
            "severityCapApplied": resolved_security.breakdown.severity_cap_applied,
            "categoryScores": {
                "transport": cs["transport"],
                "httpSecurity": cs["http_security"],
                "threatIntel": cs["threat_intel"],
                "infrastructure": cs["infrastructure"],
                "bestPractices": cs["best_practices"],
            },
        }
    return data


@router.get("/{scan_id}/detail")
async def get_scan_full_detail(
    scan_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full scan detail with all modules transformed for frontend."""
    scan = await scan_service.get_scan(db, scan_id, current_user.id)
    return SuccessResponse(
        data=_compose_scan_detail_payload(
            scan,
            key_findings_limit=DETAIL_KEY_FINDINGS_LIMIT,
        )
    )


@router.get("/{scan_id}/detail/full")
async def get_scan_full_export(
    scan_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return transformed scan detail plus untouched module raw results.

    Used by the dashboard "Export full (JSON)" action so users can take a
    portable snapshot of every module's raw output (no transformer
    flattening) alongside the dashboard summary. Owner-scoped via
    ``scan_service.get_scan``.
    """
    scan = await scan_service.get_scan(db, scan_id, current_user.id)
    summary = _compose_scan_detail_payload(
        scan,
        key_findings_limit=DETAIL_KEY_FINDINGS_LIMIT,
    )
    raw_results = {
        m.module_name: {
            "status": m.status.value,
            "durationMs": m.duration_ms,
            "errorMessage": m.error_message,
            "rawResult": m.raw_result,
        }
        for m in scan.module_results
    }

    return SuccessResponse(
        data={
            "summary": summary,
            "rawResults": raw_results,
            "exportedAt": datetime.now(timezone.utc).isoformat(),
        }
    )


@router.post("/{scan_id}/modules/{module_name}/retry")
async def retry_scan_module(
    scan_id: uuid.UUID,
    module_name: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retry a single failed or timed-out module for an existing scan."""
    result = await scan_service.retry_module(
        db,
        scan_id,
        module_name,
        user_id=current_user.id,
    )
    return SuccessResponse(data=result)


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(
    scan_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a scan. Only terminal-state scans (completed/failed/cancelled)."""
    await scan_service.delete_scan(db, scan_id, current_user.id)
    await db.commit()
    return Response(status_code=204)


@router.post("/{scan_id}/cancel", response_model=SuccessResponse[ScanResponse])
async def cancel_scan(
    scan_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a running or pending scan. Preserves partial results."""
    scan = await scan_service.cancel_scan(db, scan_id, current_user.id)
    await db.commit()
    await db.refresh(scan)
    return SuccessResponse(data=ScanResponse.model_validate(scan))


@router.get("/{scan_id}/progress")
async def scan_progress_sse(
    scan_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent Events endpoint for scan progress."""
    await scan_service.get_scan(db, scan_id, current_user.id)

    async def event_generator():
        redis = await get_redis_async()
        progress_key = f"scan:{scan_id}:progress"
        last_data = None

        try:
            initial_state = {
                "progress": 0,
                "phase": "pending",
                "detail": "Scan queued",
                "completedModules": 0,
                "totalModules": 0,
            }
            yield f"data: {json.dumps(initial_state)}\n\n"

            while True:
                raw = await redis.get(progress_key)
                if raw and raw != last_data:
                    last_data = raw
                    yield f"data: {raw}\n\n"
                    data = json.loads(raw)
                    if _sse_progress_payload_is_terminal(data):
                        await redis.expire(progress_key, PROGRESS_KEY_TTL_SECONDS)
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break
                await asyncio.sleep(0.5)
        except Exception:
            logger.exception("SSE progress stream failed for scan_id=%s", scan_id)
            error_event = {
                "progress": 0,
                "phase": "error",
                "detail": "Progress stream interrupted",
                "completedModules": 0,
                "totalModules": 0,
                "error": True,
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        finally:
            await redis.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
