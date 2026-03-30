"""Alert event APIs."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.alert import AlertEventResponse
from app.api.v1.schemas.common import SuccessResponse
from app.core.deps import CurrentUser, get_current_user, get_db
from app.services import alert_service

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=SuccessResponse[list[AlertEventResponse]])
async def list_alerts(
    current_user: CurrentUser = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=0, le=200),
    monitor_id: uuid.UUID | None = Query(None),
    capability: str | None = Query(
        None,
        pattern="^(uptime_only|content_change|ssl_expiry|visual_change)$",
    ),
    severity: str | None = Query(None, pattern="^(info|warning|critical)$"),
    suppressed: bool | None = Query(None),
    acknowledged: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await alert_service.list_alert_events_for_user(
        user_id=current_user.id,
        db=db,
        page=page,
        limit=limit,
        monitor_id=monitor_id,
        capability=capability,
        severity=severity,
        suppressed=suppressed,
        acknowledged=acknowledged,
    )
    return SuccessResponse(data=data, meta=meta)


@router.get(
    "/monitors/{monitor_id}/alerts",
    response_model=SuccessResponse[list[AlertEventResponse]],
)
async def list_monitor_alerts(
    monitor_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=0, le=200),
    capability: str | None = Query(
        None,
        pattern="^(uptime_only|content_change|ssl_expiry|visual_change)$",
    ),
    severity: str | None = Query(None, pattern="^(info|warning|critical)$"),
    suppressed: bool | None = Query(None),
    acknowledged: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    data, meta = await alert_service.list_alert_events_for_user(
        user_id=current_user.id,
        db=db,
        page=page,
        limit=limit,
        monitor_id=monitor_id,
        capability=capability,
        severity=severity,
        suppressed=suppressed,
        acknowledged=acknowledged,
    )
    return SuccessResponse(data=data, meta=meta)


@router.patch("/alerts/{alert_id}/acknowledge", response_model=SuccessResponse[AlertEventResponse])
async def acknowledge_alert(
    alert_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await alert_service.acknowledge_alert_event(
        alert_id=alert_id,
        user_id=current_user.id,
        db=db,
    )
    await db.commit()
    return SuccessResponse(data=data)
