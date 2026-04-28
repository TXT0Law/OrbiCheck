"""Per-user notification settings (Redis-backed) — channel-agnostic store.

Phase 3: this module is now the single source of truth for user-facing
notification configuration. Channel dispatch lives entirely under
``app.services.notification_channels`` (registry + adapter framework).

Legacy "free function" dispatch helpers (``dispatch_monitor_webhook`` /
``dispatch_alert_email`` / ``schedule_*``) used to live here; they were
removed once every caller routed through the channel registry. The DoD
``grep`` check enforces that no caller outside ``notification_channels/``
references those identifiers.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Top-level (legacy) settings ────────────────────────────────────────
DEFAULT_SETTINGS: dict[str, Any] = {
    "webhookUrl": None,
    "webhookEnabled": False,
    "monitorEventsEnabled": True,
    "emailEnabled": False,
    "emailAddress": None,
    "emailOnCritical": True,
    "emailOnWarning": True,
    "emailOnInfo": False,
    # Phase 3: per-channel sub-config (nested for forward compatibility).
    "channels": {
        "slack": {
            "enabled": False,
            "target": None,
            "severityFilter": ["critical", "warning"],
            "options": {},
        },
        "discord": {
            "enabled": False,
            "target": None,
            "severityFilter": ["critical", "warning"],
            "options": {},
        },
        "teams": {
            "enabled": False,
            "target": None,
            "severityFilter": ["critical", "warning"],
            "options": {},
        },
        "pagerduty": {
            "enabled": False,
            "target": None,
            "severityFilter": ["critical", "warning"],
            "options": {},
        },
    },
}

PHASE3_CHANNEL_KEYS: tuple[str, ...] = ("slack", "discord", "teams", "pagerduty")
ALLOWED_SEVERITY_FILTER: frozenset[str] = frozenset(
    {"critical", "warning", "info"}
)


def _redis_key(user_id: int) -> str:
    return f"orbicheck:user:{user_id}:notification_settings"


def _normalize_channel_block(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    target = raw.get("target")
    if isinstance(target, str):
        target = target.strip() or None
    elif target is None:
        target = None
    else:
        target = str(target) or None

    raw_filter = raw.get("severityFilter")
    if not isinstance(raw_filter, list):
        raw_filter = ["critical", "warning"]
    cleaned = [s for s in raw_filter if s in ALLOWED_SEVERITY_FILTER]
    if not cleaned:
        cleaned = ["critical", "warning"]
    options = raw.get("options")
    if not isinstance(options, dict):
        options = {}
    return {
        "enabled": bool(raw.get("enabled")),
        "target": target,
        "severityFilter": cleaned,
        "options": options,
    }


def _normalize_channels(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        raw = {}
    out: dict[str, dict[str, Any]] = {}
    for key in PHASE3_CHANNEL_KEYS:
        out[key] = _normalize_channel_block(raw.get(key))
    return out


def normalize_notification_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Reduce arbitrary input to the canonical settings shape stored in Redis."""

    if not raw:
        return _deep_copy_default()
    url = raw.get("webhookUrl")
    if url is not None and not isinstance(url, str):
        url = str(url) if url else None
    if isinstance(url, str):
        url = url.strip() or None
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
        "channels": _normalize_channels(raw.get("channels")),
    }


def _deep_copy_default() -> dict[str, Any]:
    """Defensive deep-copy so callers never mutate the module-level default."""

    return json.loads(json.dumps(DEFAULT_SETTINGS))


async def get_notification_settings(redis: Redis, user_id: int) -> dict[str, Any]:
    raw = await redis.get(_redis_key(user_id))
    if not raw:
        return _deep_copy_default()
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return _deep_copy_default()
    if not isinstance(parsed, dict):
        return _deep_copy_default()
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


async def should_dispatch_email_for_severity(
    user_id: int,
    severity: str,
    redis: Redis | None = None,
) -> bool:
    """Resolve whether the user's email settings allow dispatch for ``severity``.

    Kept as a separate helper so the ``alert_service`` cooldown / metadata
    code can still report ``email`` in ``dispatched_channels`` without
    actually invoking the channel adapter.
    """

    if not settings.EMAIL_DISPATCH_ENABLED:
        return False

    owns_redis = redis is None
    redis_client = redis or Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        cfg = await get_notification_settings(redis_client, user_id)
        return (
            bool(cfg.get("emailEnabled"))
            and bool(cfg.get("emailAddress"))
            and _severity_email_enabled(cfg, severity)
        )
    finally:
        if owns_redis:
            await redis_client.aclose()
