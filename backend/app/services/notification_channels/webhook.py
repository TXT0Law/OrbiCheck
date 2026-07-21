"""Generic HTTPS webhook channel adapter (Phase 3.1 — port of legacy code).

This is the protocol-friendly version of the original
``user_notification_settings.dispatch_monitor_webhook`` free function. The
behaviour is intentionally identical: any user-configured HTTPS URL gets the
same JSON envelope used by the existing dashboard receiver so external
integrations don't break.
"""

from __future__ import annotations

import time

import httpx
import structlog

from app.core.config import settings
from app.services.notification_channels._helpers import (
    NOTIFICATION_USER_AGENT,
    failure_result,
    log_send_error,
    post_json,
    skipped_result,
    success_result,
    validate_https_url,
)
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
)

logger = structlog.get_logger(__name__)

CHANNEL_ID = "webhook"


def _build_body(payload: AlertPayload) -> dict:
    """Mirror the legacy `{source, monitorId, event, data}` envelope shape."""

    data = {
        "alertId": payload.alert_id,
        "monitorId": payload.monitor_id,
        "capability": payload.capability,
        "eventType": payload.event_type,
        "severity": payload.severity,
        "actualValue": payload.actual_value,
        "message": payload.message,
        "thresholdConfig": payload.threshold_config,
        "createdAt": payload.created_at.isoformat() if payload.created_at else None,
        "monitorUrl": payload.monitor_url,
        "monitorName": payload.monitor_name,
        "dashboardUrl": payload.monitor_url_dashboard or None,
    }
    return {
        "source": "orbicheck-monitor",
        "monitorId": payload.monitor_id,
        "event": payload.event_type,
        "data": data,
    }


class WebhookChannel:
    channel_id = CHANNEL_ID

    def is_enabled(self, config: ChannelConfig, payload: AlertPayload) -> bool:
        if not settings.MONITOR_WEBHOOK_DISPATCH_ENABLED:
            return False
        if not config.enabled:
            return False
        if payload.severity not in config.severity_filter:
            return False
        return bool((config.target or "").strip())

    async def send(
        self,
        payload: AlertPayload,
        config: ChannelConfig,
    ) -> ChannelDispatchResult:
        target = (config.target or "").strip()
        if not target:
            return skipped_result(reason="no_target")
        try:
            target = validate_https_url(target)
        except ValueError as exc:
            log_send_error(self.channel_id, error=exc)
            return failure_result(error=str(exc), latency_ms=0)

        body = _build_body(payload)
        started = time.perf_counter()
        try:
            await post_json(
                target,
                body,
                extra_headers={"User-Agent": NOTIFICATION_USER_AGENT},
            )
        except httpx.HTTPStatusError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"webhook_http_status_{exc.response.status_code}",
                latency_ms=elapsed,
            )
        except httpx.HTTPError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"webhook_http_error:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        except ValueError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"webhook_blocked:{exc}",
                latency_ms=elapsed,
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        return success_result(latency_ms=elapsed)
