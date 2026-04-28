"""Email channel adapter (Phase 3.1 — port of legacy code).

Wraps ``email_service.send_alert_email`` so SMTP delivery flows through the
same retry queue + dispatch log as the chat / paging channels. The SMTP
credentials live in ``settings`` (not per-user) — the user-level config only
toggles the destination address and severity filter.
"""

from __future__ import annotations

import time

import aiosmtplib
import structlog

from app.core.config import settings
from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor
from app.services import email_service
from app.services.notification_channels._helpers import (
    failure_result,
    log_send_error,
    skipped_result,
    success_result,
)
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
)

logger = structlog.get_logger(__name__)

CHANNEL_ID = "email"


def _payload_to_event(payload: AlertPayload) -> AlertEvent:
    """Synthesize a transient ``AlertEvent`` for the renderer.

    ``email_service.send_alert_email`` expects ORM objects so it can pull
    ``capability``, ``severity`` etc. directly. We build a detached instance
    here rather than threading the live row through the registry — it never
    touches the session.
    """

    event = AlertEvent(
        capability=payload.capability,
        event_type=payload.event_type,
        severity=payload.severity,
        threshold_config=payload.threshold_config,
        actual_value=payload.actual_value,
        message=payload.message,
        dispatched_channels=[],
        suppressed=False,
    )
    if payload.created_at is not None:
        event.created_at = payload.created_at
    return event


def _payload_to_monitor(payload: AlertPayload) -> Monitor:
    monitor = Monitor.__new__(Monitor)
    monitor.display_name = payload.monitor_name
    monitor.url = payload.monitor_url
    return monitor


class EmailChannel:
    channel_id = CHANNEL_ID

    def is_enabled(self, config: ChannelConfig, payload: AlertPayload) -> bool:
        if not settings.EMAIL_DISPATCH_ENABLED:
            return False
        if not config.enabled:
            return False
        if not (config.target or "").strip():
            return False
        return payload.severity in config.severity_filter

    async def send(
        self,
        payload: AlertPayload,
        config: ChannelConfig,
    ) -> ChannelDispatchResult:
        if not settings.EMAIL_DISPATCH_ENABLED:
            return skipped_result(reason="disabled")
        target = (config.target or "").strip()
        if not target:
            return skipped_result(reason="no_target")

        event = _payload_to_event(payload)
        monitor = _payload_to_monitor(payload)
        started = time.perf_counter()
        try:
            sent = await email_service.send_alert_email(
                to_email=target, alert_event=event, monitor=monitor
            )
        except aiosmtplib.SMTPException as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"email_smtp:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        except OSError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"email_os:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        if not sent:
            return failure_result(error="email_not_sent", latency_ms=elapsed)
        return success_result(latency_ms=elapsed)
