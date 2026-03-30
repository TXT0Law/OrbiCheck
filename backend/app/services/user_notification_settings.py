"""Per-user notification settings (Redis) and optional webhook dispatch for monitor events."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import httpx
from redis.asyncio import Redis

from app.core.config import settings
from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor
from app.services import email_service

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS: dict[str, Any] = {
    "webhookUrl": None,
    "webhookEnabled": False,
    "monitorEventsEnabled": True,
    "emailEnabled": False,
    "emailAddress": None,
    "emailOnCritical": True,
    "emailOnWarning": True,
    "emailOnInfo": False,
}


def _redis_key(user_id: int) -> str:
    return f"orbicheck:user:{user_id}:notification_settings"


def normalize_notification_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw:
        return dict(DEFAULT_SETTINGS)
    url = raw.get("webhookUrl")
    if url is not None and not isinstance(url, str):
        url = str(url) if url else None
    if url == "":
        url = None
    email = raw.get("emailAddress")
    if email is not None and not isinstance(email, str):
        email = str(email) if email else None
    if isinstance(email, str):
        email = email.strip() or None
    return {
        "webhookUrl": url,
        "webhookEnabled": bool(raw.get("webhookEnabled")),
        "monitorEventsEnabled": bool(raw.get("monitorEventsEnabled", True)),
        "emailEnabled": bool(raw.get("emailEnabled")),
        "emailAddress": email,
        "emailOnCritical": bool(raw.get("emailOnCritical", True)),
        "emailOnWarning": bool(raw.get("emailOnWarning", True)),
        "emailOnInfo": bool(raw.get("emailOnInfo", False)),
    }


async def get_notification_settings(redis: Redis, user_id: int) -> dict[str, Any]:
    raw = await redis.get(_redis_key(user_id))
    if not raw:
        return dict(DEFAULT_SETTINGS)
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return dict(DEFAULT_SETTINGS)
    if not isinstance(parsed, dict):
        return dict(DEFAULT_SETTINGS)
    return normalize_notification_settings(parsed)


async def set_notification_settings(
    redis: Redis, user_id: int, body: dict[str, Any]
) -> dict[str, Any]:
    merged = normalize_notification_settings(body)
    await redis.set(_redis_key(user_id), json.dumps(merged))
    return merged


def _severity_email_enabled(cfg: dict[str, Any], severity: str) -> bool:
    if severity == "critical":
        return bool(cfg.get("emailOnCritical", True))
    if severity == "warning":
        return bool(cfg.get("emailOnWarning", True))
    return bool(cfg.get("emailOnInfo", False))


async def should_dispatch_alert_email(
    user_id: int,
    severity: str,
    redis: Redis | None = None,
) -> bool:
    """Resolve whether the user's email settings allow dispatch for this severity."""
    if not settings.EMAIL_DISPATCH_ENABLED:
        return False

    owns_redis = redis is None
    redis_client = redis or Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        cfg = await get_notification_settings(redis_client, user_id)
        return bool(cfg.get("emailEnabled")) and bool(cfg.get("emailAddress")) and _severity_email_enabled(
            cfg, severity
        )
    finally:
        if owns_redis:
            await redis_client.aclose()


async def dispatch_monitor_webhook(
    user_id: int,
    monitor_id: uuid.UUID,
    event_name: str,
    payload: dict[str, Any],
) -> None:
    """POST monitor event to user-configured webhook URL (best-effort, own Redis client)."""
    if not settings.MONITOR_WEBHOOK_DISPATCH_ENABLED:
        return

    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await redis.get(_redis_key(user_id))
        if not raw:
            return
        try:
            cfg = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(cfg, dict):
            return
        cfg = normalize_notification_settings(cfg)
        if not cfg["webhookEnabled"] or not cfg["monitorEventsEnabled"]:
            return
        url = (cfg.get("webhookUrl") or "").strip()
        if not url:
            return

        body = {
            "source": "orbicheck-monitor",
            "monitorId": str(monitor_id),
            "event": event_name,
            "data": payload,
        }
        async with httpx.AsyncClient(timeout=settings.MONITOR_WEBHOOK_TIMEOUT_S) as client:
            response = await client.post(url, json=body)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning(
            "monitor_webhook_http_error user_id=%s event=%s error=%s",
            user_id,
            event_name,
            str(exc)[:400],
        )
    except Exception as exc:
        logger.warning(
            "monitor_webhook_unexpected user_id=%s event=%s error=%s",
            user_id,
            event_name,
            str(exc)[:400],
        )
    finally:
        await redis.aclose()


async def dispatch_alert_email(
    user_id: int,
    monitor: Monitor,
    event: AlertEvent,
) -> None:
    """Check user email prefs and send alert email if applicable."""
    if not settings.EMAIL_DISPATCH_ENABLED:
        return

    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        cfg = await get_notification_settings(redis, user_id)
        if not cfg.get("emailEnabled"):
            return
        to_email = (cfg.get("emailAddress") or "").strip()
        if not to_email:
            return
        if not _severity_email_enabled(cfg, event.severity):
            return
        await email_service.send_alert_email(to_email=to_email, alert_event=event, monitor=monitor)
    except Exception as exc:
        logger.warning(
            "alert_email_dispatch_unexpected user_id=%s monitor_id=%s error=%s",
            user_id,
            monitor.id,
            str(exc)[:400],
        )
    finally:
        await redis.aclose()


def schedule_monitor_webhook(
    user_id: int,
    monitor_id: uuid.UUID,
    event_name: str,
    payload: dict[str, Any],
) -> None:
    """Fire-and-forget webhook dispatch (does not block check pipeline)."""

    async def _run() -> None:
        await dispatch_monitor_webhook(user_id, monitor_id, event_name, payload)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_run())
        return
    loop.create_task(_run())


def schedule_alert_email(
    user_id: int,
    monitor: Monitor,
    event: AlertEvent,
) -> None:
    """Fire-and-forget email dispatch (does not block check pipeline)."""

    async def _run() -> None:
        await dispatch_alert_email(user_id, monitor, event)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_run())
        return
    loop.create_task(_run())
