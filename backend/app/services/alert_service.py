"""Alert evaluation, persistence, and retrieval helpers."""

from __future__ import annotations

import asyncio
import copy
import json
import logging
from datetime import datetime, time, timedelta, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.alert import AlertEventResponse
from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor
from app.services.maintenance_window_service import is_alert_suppressed
from app.services.user_notification_settings import (
    dispatch_alert_email,
    dispatch_monitor_webhook,
    should_dispatch_alert_email,
)

logger = logging.getLogger(__name__)


def _user_live_channel(user_id: int) -> str:
    return f"monitor:user:{user_id}:events"


def _coerce_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(hour=int(hour), minute=int(minute), tzinfo=timezone.utc)


def _is_within_quiet_hours(
    quiet_hours: dict[str, Any] | None,
    now: datetime,
) -> bool:
    if not isinstance(quiet_hours, dict):
        return False
    start_raw = quiet_hours.get("start")
    end_raw = quiet_hours.get("end")
    if not isinstance(start_raw, str) or not isinstance(end_raw, str):
        return False
    start = _parse_hhmm(start_raw)
    end = _parse_hhmm(end_raw)
    now_t = now.astimezone(timezone.utc).timetz().replace(tzinfo=timezone.utc)
    if start == end:
        return True
    if start < end:
        return start <= now_t < end
    return now_t >= start or now_t < end


def _capability_alert_policy(monitor: Monitor, capability: str) -> dict[str, Any]:
    caps = monitor.capabilities if isinstance(monitor.capabilities, dict) else {}
    cap_cfg = caps.get(capability) if isinstance(caps, dict) else None
    if not isinstance(cap_cfg, dict):
        return {"enabled": True, "cooldownSeconds": 0, "quietHours": None}
    alert_cfg = cap_cfg.get("alert")
    if not isinstance(alert_cfg, dict):
        return {"enabled": True, "cooldownSeconds": 0, "quietHours": None}
    return {
        "enabled": bool(alert_cfg.get("enabled", True)),
        "cooldownSeconds": max(0, int(alert_cfg.get("cooldownSeconds", 0) or 0)),
        "quietHours": alert_cfg.get("quietHours"),
    }


def _capability_threshold_snapshot(monitor: Monitor, capability: str) -> dict[str, Any]:
    caps = monitor.capabilities if isinstance(monitor.capabilities, dict) else {}
    cap_cfg = caps.get(capability) if isinstance(caps, dict) else None
    if not isinstance(cap_cfg, dict):
        return {}
    thresholds = cap_cfg.get("thresholds")
    if not isinstance(thresholds, dict):
        return {}
    return copy.deepcopy(thresholds)


def serialize_alert_event(event: AlertEvent) -> AlertEventResponse:
    return AlertEventResponse(
        id=str(event.id),
        monitor_id=str(event.monitor_id),
        capability=event.capability,
        event_type=event.event_type,
        severity=event.severity,
        threshold_config=event.threshold_config or {},
        actual_value=event.actual_value,
        message=event.message,
        dispatched_channels=list(event.dispatched_channels or []),
        suppressed=event.suppressed,
        suppress_reason=event.suppress_reason,
        created_at=event.created_at,
        resolved_at=event.resolved_at,
        acknowledged_at=event.acknowledged_at,
        acknowledged_by=event.acknowledged_by,
    )


async def _create_alert_event(
    *,
    monitor: Monitor,
    capability: str,
    event_type: str,
    severity: str,
    actual_value: str,
    message: str,
    db: AsyncSession,
    threshold_config: dict[str, Any] | None,
    dispatched_channels: list[str],
    suppressed: bool,
    suppress_reason: str | None,
) -> AlertEvent:
    event = AlertEvent(
        monitor_id=monitor.id,
        capability=capability,
        event_type=event_type,
        severity=severity,
        threshold_config=threshold_config or {},
        actual_value=actual_value,
        message=message,
        dispatched_channels=dispatched_channels,
        suppressed=suppressed,
        suppress_reason=suppress_reason,
    )
    db.add(event)
    await db.flush()
    return event


async def _dispatch_alert_channels(
    *,
    redis: Redis | None,
    monitor: Monitor,
    event: AlertEvent,
    dispatch_email: bool = False,
) -> None:
    payload = {
        "alertId": str(event.id),
        "monitorId": str(monitor.id),
        "capability": event.capability,
        "eventType": event.event_type,
        "severity": event.severity,
        "actualValue": event.actual_value,
        "message": event.message,
        "suppressed": event.suppressed,
        "suppressReason": event.suppress_reason,
        "createdAt": _coerce_utc(event.created_at).isoformat() if event.created_at else None,
    }
    if redis is not None:
        wire = json.dumps({"event": "alert_event", "data": payload})
        await redis.publish(f"monitor:{monitor.id}:events", wire)
        await redis.publish(
            _user_live_channel(monitor.user_id),
            json.dumps(
                {
                    "event": "alert_event",
                    "monitorId": str(monitor.id),
                    "data": payload,
                }
            ),
        )

    side_tasks: list[asyncio.Task] = []
    loop = asyncio.get_running_loop()
    if settings.MONITOR_WEBHOOK_DISPATCH_ENABLED:
        side_tasks.append(
            loop.create_task(
                dispatch_monitor_webhook(monitor.user_id, monitor.id, "alert_event", payload)
            )
        )
    if dispatch_email:
        side_tasks.append(
            loop.create_task(dispatch_alert_email(monitor.user_id, monitor, event))
        )
    if side_tasks:
        results = await asyncio.gather(*side_tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.warning("alert_channel_dispatch_error: %s", result)


async def _latest_unsuppressed_alert(
    *,
    monitor_id: Any,
    capability: str,
    event_type: str,
    cutoff: datetime,
    db: AsyncSession,
) -> AlertEvent | None:
    stmt = (
        select(AlertEvent)
        .where(
            AlertEvent.monitor_id == monitor_id,
            AlertEvent.capability == capability,
            AlertEvent.event_type == event_type,
            AlertEvent.suppressed.is_(False),
            AlertEvent.created_at >= cutoff,
        )
        .order_by(AlertEvent.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def evaluate_and_dispatch_alert(
    monitor: Monitor,
    capability: str,
    event_type: str,
    severity: str,
    actual_value: str,
    message: str,
    db: AsyncSession,
    redis: Redis | None,
    *,
    threshold_config: dict[str, Any] | None = None,
    extra_suppression_reason: str | None = None,
    now: datetime | None = None,
) -> AlertEvent | None:
    current_time = _coerce_utc(now) or datetime.now(timezone.utc)
    policy = _capability_alert_policy(monitor, capability)
    threshold_snapshot = threshold_config or _capability_threshold_snapshot(monitor, capability)

    if not policy["enabled"]:
        await _create_alert_event(
            monitor=monitor,
            capability=capability,
            event_type=event_type,
            severity=severity,
            actual_value=actual_value,
            message=message,
            db=db,
            threshold_config=threshold_snapshot,
            dispatched_channels=[],
            suppressed=True,
            suppress_reason="alert_disabled",
        )
        return None

    active_window = await is_alert_suppressed(
        monitor.user_id, monitor.id, db, at=current_time
    )
    if active_window is not None:
        await _create_alert_event(
            monitor=monitor,
            capability=capability,
            event_type=event_type,
            severity=severity,
            actual_value=actual_value,
            message=message,
            db=db,
            threshold_config=threshold_snapshot,
            dispatched_channels=[],
            suppressed=True,
            suppress_reason=f"maintenance_window:{active_window.id}",
        )
        return None

    if _is_within_quiet_hours(policy["quietHours"], current_time):
        await _create_alert_event(
            monitor=monitor,
            capability=capability,
            event_type=event_type,
            severity=severity,
            actual_value=actual_value,
            message=message,
            db=db,
            threshold_config=threshold_snapshot,
            dispatched_channels=[],
            suppressed=True,
            suppress_reason="quiet_hours",
        )
        return None

    cooldown_seconds = policy["cooldownSeconds"]
    if cooldown_seconds > 0:
        last_event = await _latest_unsuppressed_alert(
            monitor_id=monitor.id,
            capability=capability,
            event_type=event_type,
            cutoff=current_time - timedelta(seconds=cooldown_seconds),
            db=db,
        )
        if last_event is not None:
            await _create_alert_event(
                monitor=monitor,
                capability=capability,
                event_type=event_type,
                severity=severity,
                actual_value=actual_value,
                message=message,
                db=db,
                threshold_config=threshold_snapshot,
                dispatched_channels=[],
                suppressed=True,
                suppress_reason="cooldown",
            )
            return None

    if extra_suppression_reason:
        await _create_alert_event(
            monitor=monitor,
            capability=capability,
            event_type=event_type,
            severity=severity,
            actual_value=actual_value,
            message=message,
            db=db,
            threshold_config=threshold_snapshot,
            dispatched_channels=[],
            suppressed=True,
            suppress_reason=extra_suppression_reason,
        )
        return None

    dispatch_email = await should_dispatch_alert_email(
        monitor.user_id,
        severity,
        redis=redis,
    )

    dispatched_channels = ["sse"]
    if settings.MONITOR_WEBHOOK_DISPATCH_ENABLED:
        dispatched_channels.append("webhook")
    if dispatch_email:
        dispatched_channels.append("email")
    event = await _create_alert_event(
        monitor=monitor,
        capability=capability,
        event_type=event_type,
        severity=severity,
        actual_value=actual_value,
        message=message,
        db=db,
        threshold_config=threshold_snapshot,
        dispatched_channels=dispatched_channels,
        suppressed=False,
        suppress_reason=None,
    )
    await _dispatch_alert_channels(
        redis=redis,
        monitor=monitor,
        event=event,
        dispatch_email=dispatch_email,
    )
    return event


async def list_alert_events_for_user(
    *,
    user_id: int,
    db: AsyncSession,
    page: int,
    limit: int,
    monitor_id: Any | None = None,
    capability: str | None = None,
    severity: str | None = None,
    suppressed: bool | None = None,
    acknowledged: bool | None = None,
) -> tuple[list[AlertEventResponse], dict[str, int]]:
    if monitor_id is not None:
        owned_monitor = await db.scalar(
            select(Monitor.id).where(
                Monitor.id == monitor_id,
                Monitor.user_id == user_id,
            )
        )
        if owned_monitor is None:
            raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")

    filters = [Monitor.user_id == user_id]
    if monitor_id is not None:
        filters.append(AlertEvent.monitor_id == monitor_id)
    if capability:
        filters.append(AlertEvent.capability == capability)
    if severity:
        filters.append(AlertEvent.severity == severity)
    if suppressed is not None:
        filters.append(AlertEvent.suppressed.is_(suppressed))
    if acknowledged is True:
        filters.append(AlertEvent.acknowledged_at.is_not(None))
    elif acknowledged is False:
        filters.append(AlertEvent.acknowledged_at.is_(None))

    count_stmt = (
        select(func.count())
        .select_from(AlertEvent)
        .join(Monitor, AlertEvent.monitor_id == Monitor.id)
        .where(and_(*filters))
    )
    total = int(await db.scalar(count_stmt) or 0)

    rows: list[AlertEvent] = []
    if limit > 0:
        offset = (page - 1) * limit
        stmt = (
            select(AlertEvent)
            .join(Monitor, AlertEvent.monitor_id == Monitor.id)
            .where(and_(*filters))
            .order_by(AlertEvent.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = list((await db.execute(stmt)).scalars().all())

    meta = {"page": page, "limit": limit, "total": total}
    return [serialize_alert_event(row) for row in rows], meta


async def acknowledge_alert_event(
    *,
    alert_id: Any,
    user_id: int,
    db: AsyncSession,
) -> AlertEventResponse:
    stmt = (
        select(AlertEvent)
        .join(Monitor, AlertEvent.monitor_id == Monitor.id)
        .where(
            AlertEvent.id == alert_id,
            Monitor.user_id == user_id,
        )
        .limit(1)
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise NotFoundError(code="ALERT_NOT_FOUND", message="Alert not found")
    if event.acknowledged_at is None:
        event.acknowledged_at = datetime.now(timezone.utc)
        event.acknowledged_by = str(user_id)
        await db.flush()
    return serialize_alert_event(event)
