"""PagerDuty Events API v2 channel adapter (Phase 3.5).

Unlike the chat channels, PagerDuty configuration takes an *integration key*
(a 32-character hex string from a PagerDuty service) instead of a webhook
URL. This adapter:

* maps OrbiCheck severities to the matching PagerDuty Events v2 severity
  (``critical | warning | info``);
* fires ``trigger`` for new alerts and ``resolve`` for monitor-recovery
  events, sharing the same ``dedup_key = monitor:{id}:{capability}`` so the
  same incident is closed instead of being duplicated;
* short-circuits silently when the alert is informational and the user has
  not opted into ``info`` severity (PagerDuty's "info" event is not visible
  in incident lists by default — surfacing it would be misleading).
"""

from __future__ import annotations

import re
import time

import httpx
import structlog

from app.core.config import settings
from app.services.notification_channels._helpers import (
    NOTIFICATION_USER_AGENT,
    failure_result,
    log_send_error,
    render_alert_title,
    skipped_result,
    success_result,
)
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
    PagerDutyEventAction,
)

logger = structlog.get_logger(__name__)

CHANNEL_ID = "pagerduty"
PAGERDUTY_INTEGRATION_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
PAGERDUTY_SOURCE = "orbicheck"
PAGERDUTY_SUMMARY_MAX = 1024


def validate_integration_key(value: str) -> str:
    """Validate a PagerDuty Events API v2 integration key shape.

    The "real" format is 32 hex chars but several service types issue keys
    with extra characters; we accept any URL-safe token between 20 and 128
    chars to stay future-proof.
    """

    if not isinstance(value, str):
        raise ValueError("PagerDuty integration key must be a string")
    candidate = value.strip()
    if not PAGERDUTY_INTEGRATION_KEY_PATTERN.match(candidate):
        raise ValueError(
            "PagerDuty integration key must be 20-128 chars (letters/digits/_/-)"
        )
    return candidate


def severity_for_pagerduty(severity: str) -> str:
    if severity == "critical":
        return "critical"
    if severity == "warning":
        return "warning"
    return "info"


def build_event_payload(
    payload: AlertPayload, *, integration_key: str
) -> dict:
    action = payload.pagerduty_event_action.value
    body: dict = {
        "routing_key": integration_key,
        "event_action": action,
        "dedup_key": payload.dedup_key
        or f"monitor:{payload.monitor_id}:{payload.capability}",
        "client": "OrbiCheck",
    }
    if action == PagerDutyEventAction.TRIGGER.value:
        custom_details: dict = {
            "monitor_id": payload.monitor_id,
            "capability": payload.capability,
            "actual_value": payload.actual_value,
            "monitor_url": payload.monitor_url,
        }
        if payload.threshold_config:
            custom_details["threshold_config"] = payload.threshold_config
        body["payload"] = {
            "summary": (
                payload.message[:PAGERDUTY_SUMMARY_MAX]
                or render_alert_title(payload)[:PAGERDUTY_SUMMARY_MAX]
            ),
            "source": PAGERDUTY_SOURCE,
            "severity": severity_for_pagerduty(payload.severity),
            "component": payload.capability,
            "group": "OrbiCheck",
            "class": payload.event_type,
            "custom_details": custom_details,
        }
        if payload.monitor_url_dashboard:
            body["links"] = [
                {
                    "href": payload.monitor_url_dashboard,
                    "text": "Open in OrbiCheck",
                }
            ]
    return body


class PagerDutyChannel:
    channel_id = CHANNEL_ID

    def is_enabled(self, config: ChannelConfig, payload: AlertPayload) -> bool:
        if not config.enabled:
            return False
        if not (config.target or "").strip():
            return False
        # ``resolve`` events must always be sent even when the user filters
        # out ``info`` severity — otherwise a recovered monitor stays open
        # indefinitely.
        if payload.pagerduty_event_action == PagerDutyEventAction.RESOLVE:
            return True
        return payload.severity in config.severity_filter

    async def send(
        self,
        payload: AlertPayload,
        config: ChannelConfig,
    ) -> ChannelDispatchResult:
        raw_key = (config.target or "").strip()
        if not raw_key:
            return skipped_result(reason="no_target")
        try:
            integration_key = validate_integration_key(raw_key)
        except ValueError as exc:
            log_send_error(self.channel_id, error=exc)
            return failure_result(error=str(exc), latency_ms=0)

        body = build_event_payload(payload, integration_key=integration_key)
        url = settings.PAGERDUTY_EVENTS_API_URL
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(
                timeout=settings.NOTIFICATION_CHANNEL_TIMEOUT_S
            ) as client:
                response = await client.post(
                    url,
                    json=body,
                    headers={"User-Agent": NOTIFICATION_USER_AGENT},
                )
            # PagerDuty Events v2 returns 202 on accepted enqueue.
            if response.status_code not in (200, 201, 202):
                elapsed = int((time.perf_counter() - started) * 1000)
                err = f"pagerduty_http_status_{response.status_code}"
                logger.warning(
                    "notification_channel_send_failed",
                    channel_id=self.channel_id,
                    status=response.status_code,
                )
                return failure_result(error=err, latency_ms=elapsed)
        except httpx.HTTPError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"pagerduty_http_error:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        return success_result(latency_ms=elapsed)
