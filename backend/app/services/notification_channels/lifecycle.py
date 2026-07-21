"""Lifecycle (non-alert) webhook helper used by ``monitor_service``.

The Phase 3 channel adapter framework persists every dispatch attempt in
``osint_notification_dispatch_log`` so the retry queue can re-fire failed
deliveries. That makes sense for *alert* events (a few per day) but would
flood the table with rows for routine ``check_completed`` events that fire
on every probe interval.

This helper keeps the legacy single-webhook dispatch path for those
high-volume lifecycle events without going through the dispatch log. It
loads per-user settings from Redis the same way the legacy
``dispatch_monitor_webhook`` did, so existing receivers keep working with
no contract change.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import httpx
import structlog
from redis.asyncio import Redis

from app.core.config import settings
from app.services.notification_channels._helpers import post_json

logger = structlog.get_logger(__name__)


def _redis_key(user_id: int) -> str:
    return f"orbicheck:user:{user_id}:notification_settings"


async def _load_webhook_target(redis: Redis, user_id: int) -> str | None:
    raw = await redis.get(_redis_key(user_id))
    if not raw:
        return None
    try:
        cfg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(cfg, dict):
        return None
    if not cfg.get("webhookEnabled"):
        return None
    if not cfg.get("monitorEventsEnabled", True):
        return None
    target = (cfg.get("webhookUrl") or "").strip()
    return target or None


async def publish_monitor_lifecycle_webhook(
    user_id: int,
    monitor_id: uuid.UUID,
    event_name: str,
    payload: dict[str, Any],
) -> None:
    """POST a non-alert lifecycle event to the user-configured webhook URL.

    Best-effort — failures are logged but not retried (the retry queue is
    reserved for alert-event deliveries).
    """

    if not settings.MONITOR_WEBHOOK_DISPATCH_ENABLED:
        return

    redis: Redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        target = await _load_webhook_target(redis, user_id)
        if not target:
            return
        body = {
            "source": "orbicheck-monitor",
            "monitorId": str(monitor_id),
            "event": event_name,
            "data": payload,
        }
        try:
            await post_json(target, body)
        except httpx.HTTPError as exc:
            logger.warning(
                "monitor_lifecycle_webhook_http_error",
                user_id=user_id,
                event=event_name,
                error=str(exc)[:200],
            )
        except ValueError as exc:
            logger.warning(
                "monitor_lifecycle_webhook_blocked",
                user_id=user_id,
                event=event_name,
                error=str(exc)[:200],
            )
    finally:
        await redis.aclose()
