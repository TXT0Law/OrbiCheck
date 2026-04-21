"""Phase 2.4 — Maintenance window CRUD endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.monitor import (
    MaintenanceWindowCreateRequest,
    MaintenanceWindowResponse,
    MaintenanceWindowUpdateRequest,
)
from app.core.deps import CurrentUser, get_current_user, get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.models.monitor import MaintenanceWindow
from app.services import maintenance_window_service

router = APIRouter(prefix="/maintenance-windows", tags=["maintenance-windows"])


def _to_response(row: MaintenanceWindow) -> MaintenanceWindowResponse:
    return MaintenanceWindowResponse(
        id=str(row.id),
        user_id=row.user_id,
        monitor_id=str(row.monitor_id) if row.monitor_id else None,
        title=row.title,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        suppress_alerts=row.suppress_alerts,
        suppress_probes=row.suppress_probes,
        is_enabled=row.is_enabled,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _parse_optional_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            code="MAINT_WINDOW_BAD_MONITOR_ID",
            message="monitorId must be a valid UUID",
        ) from exc


@router.get("", response_model=SuccessResponse[list[MaintenanceWindowResponse]])
async def list_windows(
    monitor_id: str | None = Query(default=None, alias="monitorId"),
    include_disabled: bool = Query(default=True, alias="includeDisabled"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = _parse_optional_uuid(monitor_id)
    rows = await maintenance_window_service.list_windows_for_user(
        current_user.id,
        db,
        monitor_id=parsed,
        include_disabled=include_disabled,
    )
    return SuccessResponse(data=[_to_response(r) for r in rows])


@router.post(
    "",
    status_code=201,
    response_model=SuccessResponse[MaintenanceWindowResponse],
)
async def create_window(
    payload: MaintenanceWindowCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    monitor_id = _parse_optional_uuid(payload.monitor_id)
    try:
        row = await maintenance_window_service.create_window(
            user_id=current_user.id,
            monitor_id=monitor_id,
            title=payload.title,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            suppress_alerts=payload.suppress_alerts,
            suppress_probes=payload.suppress_probes,
            notes=payload.notes,
            db=db,
        )
        if not payload.is_enabled:
            row.is_enabled = False
            await db.flush()
    except ValueError as exc:
        raise ValidationError(
            code="MAINT_WINDOW_INVALID_RANGE", message=str(exc)
        ) from exc
    await db.commit()
    return SuccessResponse(data=_to_response(row))


@router.patch(
    "/{window_id}",
    response_model=SuccessResponse[MaintenanceWindowResponse],
)
async def update_window(
    window_id: uuid.UUID,
    payload: MaintenanceWindowUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    monitor_arg: object = ...
    if payload.clear_monitor_scope:
        monitor_arg = None
    elif payload.monitor_id is not None:
        monitor_arg = _parse_optional_uuid(payload.monitor_id)
    try:
        row = await maintenance_window_service.update_window(
            window_id=window_id,
            user_id=current_user.id,
            db=db,
            title=payload.title,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            suppress_alerts=payload.suppress_alerts,
            suppress_probes=payload.suppress_probes,
            is_enabled=payload.is_enabled,
            notes=payload.notes,
            monitor_id=monitor_arg,
        )
    except ValueError as exc:
        raise ValidationError(
            code="MAINT_WINDOW_INVALID_RANGE", message=str(exc)
        ) from exc
    if row is None:
        raise NotFoundError(
            code="MAINT_WINDOW_NOT_FOUND",
            message="Maintenance window not found",
        )
    await db.commit()
    return SuccessResponse(data=_to_response(row))


@router.delete(
    "/{window_id}",
    response_model=SuccessResponse[dict],
)
async def delete_window(
    window_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await maintenance_window_service.delete_window(
        window_id=window_id, user_id=current_user.id, db=db
    )
    if not deleted:
        raise NotFoundError(
            code="MAINT_WINDOW_NOT_FOUND",
            message="Maintenance window not found",
        )
    await db.commit()
    return SuccessResponse(data={"deleted": True})
