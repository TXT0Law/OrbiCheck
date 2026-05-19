"""Microsoft Teams (incoming-webhook) channel adapter (Phase 3.4).

Posts a MessageCard JSON payload (the legacy "Office 365 Connector" format
that is still supported by classic Teams "Incoming Webhook" connectors) to
the user-supplied URL. Only ``*.webhook.office.com`` hosts are accepted.
"""

from __future__ import annotations

import time

import httpx
import structlog

from app.services.notification_channels._helpers import (
    failure_result,
    log_send_error,
    post_json,
    render_alert_title,
    render_monitor_link,
    severity_colour_hex,
    skipped_result,
    success_result,
    url_matches_allowed_hosts,
    validate_https_url,
)
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
)

logger = structlog.get_logger(__name__)

CHANNEL_ID = "teams"
TEAMS_ALLOWED_HOSTS: tuple[str, ...] = ("webhook.office.com",)


def validate_target_url(url: str) -> str:
    candidate = validate_https_url(url)
    if not url_matches_allowed_hosts(candidate, TEAMS_ALLOWED_HOSTS):
        raise ValueError(
            "Teams webhook URL must point at *.webhook.office.com"
        )
    return candidate


def _build_message_card(payload: AlertPayload) -> dict:
    severity_label = payload.severity.upper()
    facts = [
        {"name": "Capability", "value": payload.capability},
        {"name": "Severity", "value": severity_label},
    ]
    if payload.actual_value:
        facts.append({"name": "Detected", "value": payload.actual_value})

    sections = [
        {
            "activityTitle": render_alert_title(payload),
            "activitySubtitle": payload.message,
            "facts": facts,
            "markdown": True,
        }
    ]
    deep_link = render_monitor_link(payload)
    actions: list[dict] = []
    if deep_link:
        actions.append(
            {
                "@type": "OpenUri",
                "name": "Open Monitor",
                "targets": [{"os": "default", "uri": deep_link}],
            }
        )

    card: dict = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": f"OrbiCheck alert: {payload.monitor_name}",
        "themeColor": severity_colour_hex(payload.severity).lstrip("#"),
        "title": f"[{severity_label}] {render_alert_title(payload)}",
        "text": payload.message,
        "sections": sections,
    }
    if actions:
        card["potentialAction"] = actions
    return card


class TeamsChannel:
    channel_id = CHANNEL_ID

    def is_enabled(self, config: ChannelConfig, payload: AlertPayload) -> bool:
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
            target = validate_target_url(target)
        except ValueError as exc:
            log_send_error(self.channel_id, error=exc)
            return failure_result(error=str(exc), latency_ms=0)
        body = _build_message_card(payload)
        started = time.perf_counter()
        try:
            # Teams returns 200 with body "1" on success; the helper accepts
            # any 2xx so no extra handling here.
            await post_json(target, body)
        except httpx.HTTPStatusError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"teams_http_status_{exc.response.status_code}",
                latency_ms=elapsed,
            )
        except httpx.HTTPError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"teams_http_error:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        return success_result(latency_ms=elapsed)
