"""Phase 3 notification channel adapter framework.

This package replaces the ad-hoc free-function dispatch in
``user_notification_settings`` (``dispatch_monitor_webhook`` /
``dispatch_alert_email``) with a uniform Protocol so the alert pipeline can
treat every outbound integration (webhook, email, Slack, Discord, Teams,
PagerDuty) the same way.

* :class:`AlertPayload` — Pydantic envelope sent to every channel.
* :class:`ChannelDispatchResult` — per-attempt outcome (success/failure +
  latency).
* :class:`NotificationChannel` — Protocol every adapter implements.
* :func:`registry.list_channels` — single source of truth used by
  ``alert_service`` and ``POST /notifications/test``.

Channels live as one module each (``slack.py``, ``discord.py`` …) so
adding a new integration is one-file scoped. Failures are logged via
``structlog`` (never ``print``) and bubbled up to the retry queue
(``retry_notification_dispatch`` Celery task) through
:func:`record_dispatch_attempt`.
"""

from __future__ import annotations

from app.services.notification_channels.types import (
    ALERT_EVENT_TYPE,
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
    NotificationChannel,
    PagerDutyEventAction,
)

__all__ = [
    "ALERT_EVENT_TYPE",
    "AlertPayload",
    "ChannelConfig",
    "ChannelDispatchResult",
    "NotificationChannel",
    "PagerDutyEventAction",
]
