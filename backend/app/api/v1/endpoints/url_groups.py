"""URL Group API endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.url_group import (
    UrlGroupCreateRequest,
    UrlGroupDetailResponse,
    UrlGroupListResponse,
    UrlGroupMemberAddRequest,
    UrlGroupMemberResponse,
    UrlGroupResponse,
    UrlGroupUpdateRequest,
)
from app.core.deps import get_db
from app.services import url_group_service
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/url-groups", tags=["url-groups"])


def _group_to_response(group, member_count: int) -> UrlGroupResponse:
    return UrlGroupResponse(
        id=str(group.id),
        name=group.name,
        description=group.description,
        member_count=member_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


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
