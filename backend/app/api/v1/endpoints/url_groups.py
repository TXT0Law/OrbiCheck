"""URL Group API endpoints."""

import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.operational_event import OperationalEventListResponse
from app.api.v1.schemas.url_group import (
    UrlGroupCreateRequest,
    UrlGroupDetailResponse,
    UrlGroupListResponse,
    UrlGroupMemberAddRequest,
    UrlGroupMemberResponse,
    UrlGroupRunCreateRequest,
    UrlGroupRunListResponse,
    UrlGroupRunResponse,
    UrlGroupResponse,
    UrlGroupUpdateRequest,
)
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user, get_db
from app.core.redis import get_redis_async
from app.models.url_group import UrlGroupRunStatus
from app.services import operational_event_service, url_group_run_service, url_group_service
from app.tasks.url_group_run_tasks import process_url_group_run
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(
    prefix="/url-groups",
    tags=["url-groups"],
    dependencies=[Depends(get_current_user)],
)
GROUP_RUN_PROGRESS_POLL_SECONDS = 0.5
INLINE_GROUP_RUN_ENVS = {"development", "test-linked"}


def _group_to_response(group, member_count: int) -> UrlGroupResponse:
    return UrlGroupResponse(
        id=str(group.id),
        name=group.name,
        description=group.description,
        member_count=member_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def _run_to_response(run) -> UrlGroupRunResponse:
    return UrlGroupRunResponse.model_validate(
        url_group_run_service.run_to_dict(run, include_members=True)
    )


def _run_is_terminal(run) -> bool:
    return run.status in (
        UrlGroupRunStatus.COMPLETED,
        UrlGroupRunStatus.FAILED,
        UrlGroupRunStatus.CANCELLED,
        UrlGroupRunStatus.PARTIAL,
    )


def _should_run_group_scan_inline() -> bool:
    return settings.APP_ENV.lower() in INLINE_GROUP_RUN_ENVS


@router.get("", response_model=SuccessResponse[UrlGroupListResponse])
async def list_groups(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List URL groups with pagination."""
    rows, total = await url_group_service.list_groups(db, skip=skip, limit=limit)
    groups = [_group_to_response(grp, cnt) for grp, cnt in rows]
    return SuccessResponse(data=UrlGroupListResponse(groups=groups, total=total))


@router.post("", status_code=201, response_model=SuccessResponse[UrlGroupResponse])
async def create_group(
    request: UrlGroupCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new URL group."""
    group = await url_group_service.create_group(
        name=request.name,
        db=db,
        description=request.description,
    )
    await db.commit()
    await db.refresh(group)
    cnt = await url_group_service.get_member_count(group.id, db)
    return SuccessResponse(data=_group_to_response(group, cnt))


@router.get("/{group_id}", response_model=SuccessResponse[UrlGroupDetailResponse])
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get group detail with members and scan status."""
    group = await url_group_service.get_group(
        group_id, db, include_members=True
    )
    members_data = await url_group_service.get_members_with_scan_status(
        group_id, db
    )
    members = [UrlGroupMemberResponse.model_validate(m) for m in members_data]
    return SuccessResponse(
        data=UrlGroupDetailResponse(
            id=str(group.id),
            name=group.name,
            description=group.description,
            member_count=len(members),
            created_at=group.created_at,
            updated_at=group.updated_at,
            members=members,
        )
    )


@router.put("/{group_id}", response_model=SuccessResponse[UrlGroupResponse])
async def update_group(
    group_id: uuid.UUID,
    request: UrlGroupUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update group name and/or description."""
    group = await url_group_service.update_group(
        group_id,
        db,
        name=request.name,
        description=request.description,
    )
    await db.commit()
    await db.refresh(group)
    cnt = await url_group_service.get_member_count(group.id, db)
    return SuccessResponse(data=_group_to_response(group, cnt))


@router.delete("/{group_id}", response_model=SuccessResponse[dict])
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete group and all members."""
    await url_group_service.delete_group(group_id, db)
    await db.commit()
    return SuccessResponse(data={"deleted": True})


@router.get("/{group_id}/members", response_model=SuccessResponse[dict])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List group members with scan status."""
    members_data = await url_group_service.get_members_with_scan_status(
        group_id, db
    )
    members = [UrlGroupMemberResponse.model_validate(m) for m in members_data]
    return SuccessResponse(data={"members": members})


@router.post(
    "/{group_id}/members",
    status_code=201,
    response_model=SuccessResponse[UrlGroupMemberResponse],
)
async def add_member(
    group_id: uuid.UUID,
    request: UrlGroupMemberAddRequest,
    db: AsyncSession = Depends(get_db),
):
    """Add URL to group."""
    try:
        member = await url_group_service.add_member(
            group_id,
            url=request.url,
            db=db,
            display_label=request.display_label,
        )
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(e)) from e
    await db.commit()
    await db.refresh(member)
    resp = UrlGroupMemberResponse(
        id=str(member.id),
        url=member.url,
        display_label=member.display_label,
        sort_order=member.sort_order,
        created_at=member.created_at,
        scan_id=None,
        status="incomplete",
        security_score=None,
    )
    return SuccessResponse(data=resp)


@router.delete(
    "/{group_id}/members/{member_id}",
    response_model=SuccessResponse[dict],
)
async def remove_member(
    group_id: uuid.UUID,
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove member from group."""
    await url_group_service.remove_member(group_id, member_id, db)
    await db.commit()
    return SuccessResponse(data={"deleted": True})


@router.post(
    "/{group_id}/runs",
    status_code=201,
    response_model=SuccessResponse[UrlGroupRunResponse],
)
async def create_group_run(
    group_id: uuid.UUID,
    request: UrlGroupRunCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create and enqueue a URL group batch scan run."""
    run = await url_group_run_service.create_group_run(
        group_id=group_id,
        db=db,
        user_id=current_user.id,
        modules=request.modules,
        enable_port_scan=request.enable_port_scan,
        port_scan_profile=request.port_scan_profile,
        acknowledge_scan_authorization=request.acknowledge_scan_authorization,
        concurrency_limit=request.concurrency_limit,
        skip_recently_scanned_within_seconds=(
            request.skip_recently_scanned_within_seconds
        ),
    )
    await db.commit()
    await url_group_run_service.publish_progress_snapshot(run)

    if not _run_is_terminal(run):
        scan_options = {
            "enablePortScan": request.enable_port_scan,
            "portScanProfile": request.port_scan_profile,
            "acknowledgeScanAuthorization": request.acknowledge_scan_authorization,
        }
        if _should_run_group_scan_inline():
            background_tasks.add_task(
                process_url_group_run.run,
                str(run.id),
                request.modules,
                scan_options,
            )
        else:
            process_url_group_run.delay(str(run.id), request.modules, scan_options)

    return SuccessResponse(data=_run_to_response(run))


@router.get(
    "/{group_id}/runs",
    response_model=SuccessResponse[UrlGroupRunListResponse],
)
async def list_group_runs(
    group_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List historical group scan runs."""
    runs, total = await url_group_run_service.list_group_runs(
        group_id=group_id,
        db=db,
        skip=skip,
        limit=limit,
        user_id=current_user.id,
    )
    return SuccessResponse(
        data=UrlGroupRunListResponse(
            runs=[_run_to_response(run) for run in runs],
            total=total,
        )
    )


@router.get(
    "/{group_id}/runs/{run_id}",
    response_model=SuccessResponse[UrlGroupRunResponse],
)
async def get_group_run(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get group scan run detail with per-member statuses."""
    run = await url_group_run_service.get_group_run(
        group_id,
        run_id,
        db,
        user_id=current_user.id,
    )
    return SuccessResponse(data=_run_to_response(run))


@router.post(
    "/{group_id}/runs/{run_id}/cancel",
    response_model=SuccessResponse[UrlGroupRunResponse],
)
async def cancel_group_run(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a queued or active URL group scan run."""
    run = await url_group_run_service.cancel_group_run(
        group_id=group_id,
        run_id=run_id,
        db=db,
        user_id=current_user.id,
    )
    await db.commit()
    return SuccessResponse(data=_run_to_response(run))


@router.get(
    "/{group_id}/runs/{run_id}/events",
    response_model=SuccessResponse[OperationalEventListResponse],
)
async def get_group_run_events(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    limit: int = Query(default=25, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List recent diagnostics for one URL group scan run."""
    events = await operational_event_service.list_events_for_group_run(
        db,
        group_id=group_id,
        group_run_id=run_id,
        user_id=current_user.id,
        limit=limit,
    )
    return SuccessResponse(data=OperationalEventListResponse(events=events))


@router.post(
    "/{group_id}/runs/{run_id}/retry-failed",
    status_code=201,
    response_model=SuccessResponse[UrlGroupRunResponse],
)
async def retry_failed_group_run(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    request: UrlGroupRunCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group run for failed members from a previous run."""
    run = await url_group_run_service.retry_failed_group_run(
        group_id=group_id,
        run_id=run_id,
        db=db,
        user_id=current_user.id,
        modules=request.modules,
        enable_port_scan=request.enable_port_scan,
        port_scan_profile=request.port_scan_profile,
        acknowledge_scan_authorization=request.acknowledge_scan_authorization,
        concurrency_limit=request.concurrency_limit,
    )
    await db.commit()
    await url_group_run_service.publish_progress_snapshot(run)

    scan_options = {
        "enablePortScan": request.enable_port_scan,
        "portScanProfile": request.port_scan_profile,
        "acknowledgeScanAuthorization": request.acknowledge_scan_authorization,
    }
    if _should_run_group_scan_inline():
        background_tasks.add_task(
            process_url_group_run.run,
            str(run.id),
            request.modules,
            scan_options,
        )
    else:
        process_url_group_run.delay(str(run.id), request.modules, scan_options)

    return SuccessResponse(data=_run_to_response(run))


@router.get("/{group_id}/runs/{run_id}/progress")
async def group_run_progress_sse(
    group_id: uuid.UUID,
    run_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent Events endpoint for group scan progress."""
    initial_run = await url_group_run_service.get_group_run(
        group_id,
        run_id,
        db,
        user_id=current_user.id,
    )

    async def event_generator():
        redis = await get_redis_async()
        progress_key = f"url-group-run:{run_id}:progress"
        last_data = None
        try:
            initial_payload = url_group_run_service.run_to_dict(initial_run)
            yield f"data: {json.dumps(initial_payload, default=str)}\n\n"

            while True:
                raw = await redis.get(progress_key)
                if raw and raw != last_data:
                    last_data = raw
                    yield f"data: {raw}\n\n"
                    data = json.loads(raw)
                    if data.get("status") in {
                        "completed",
                        "failed",
                        "cancelled",
                        "partial",
                    }:
                        await redis.expire(
                            progress_key,
                            url_group_run_service.GROUP_RUN_PROGRESS_REDIS_TTL_SECONDS,
                        )
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break
                elif not raw:
                    run = await url_group_run_service.get_group_run(
                        group_id,
                        run_id,
                        db,
                        user_id=current_user.id,
                    )
                    payload = url_group_run_service.run_to_dict(run)
                    encoded = json.dumps(payload, default=str)
                    if encoded != last_data:
                        last_data = encoded
                        yield f"data: {encoded}\n\n"
                    if _run_is_terminal(run):
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break
                await asyncio.sleep(GROUP_RUN_PROGRESS_POLL_SECONDS)
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
