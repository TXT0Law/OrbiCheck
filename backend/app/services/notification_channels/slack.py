"""Slack incoming-webhook channel adapter (Phase 3.2).

Posts a Block Kit JSON payload to a user-configured webhook URL. The URL
must point at ``https://hooks.slack.com/...`` — anything else is rejected
both at config time and again at send time so a stale Redis value cannot
escape.
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

CHANNEL_ID = "slack"
SLACK_ALLOWED_HOSTS: tuple[str, ...] = ("hooks.slack.com",)
SLACK_TEXT_FALLBACK_MAX = 240


def validate_target_url(url: str) -> str:
    """Validate ``url`` is a Slack incoming-webhook target.

    Raises ``ValueError`` so the API layer can surface a 422 with a stable
    error code (see ``user_notification_settings.normalize_notification_settings``).
    """

    candidate = validate_https_url(url)
    if not url_matches_allowed_hosts(candidate, SLACK_ALLOWED_HOSTS):
        raise ValueError(
            "Slack webhook URL must point at hooks.slack.com"
        )
    return candidate


def _build_block_kit(payload: AlertPayload) -> dict:
    """Render the Slack Block Kit JSON for an alert payload.

    The Slack API ignores ``attachments[].color`` for some workspaces but
    keeps it for legacy clients — we keep it for backward compatibility.
    The new-style ``blocks`` array drives the rendering everywhere else.
    """

    severity_label = payload.severity.upper()
    fallback_text = (
        f"[{severity_label}] {payload.monitor_name}: {payload.message}"
    )[:SLACK_TEXT_FALLBACK_MAX]

    fields = [
        {
            "type": "mrkdwn",
            "text": f"*Capability*\n{payload.capability}",
        },
        {
            "type": "mrkdwn",
            "text": f"*Severity*\n{severity_label}",
        },
    ]
    if payload.actual_value:
        fields.append(
            {
                "type": "mrkdwn",
                "text": f"*Detected*\n{payload.actual_value}",
            }
        )

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": render_alert_title(payload),
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": payload.message},
        },
        {"type": "section", "fields": fields},
    ]
    deep_link = render_monitor_link(payload)
    if deep_link:
        blocks.append(
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "style": "primary",
                        "text": {
                            "type": "plain_text",
                            "text": "Open Monitor",
                            "emoji": True,
                        },
                        "url": deep_link,
                    }
                ],
            }
        )

    return {
        "text": fallback_text,
        "blocks": blocks,
        "attachments": [
            {
                "color": severity_colour_hex(payload.severity),
                "blocks": [],
            }
        ],
    }


class SlackChannel:
    channel_id = CHANNEL_ID

    def is_enabled(self, config: ChannelConfig, payload: AlertPayload) -> bool:
        if not config.enabled:
            return False
        if payload.severity not in config.severity_filter:
            return False
        if not (config.target or "").strip():
            return False
        return True

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

        body = _build_block_kit(payload)
        started = time.perf_counter()
        try:
            await post_json(target, body)
        except httpx.HTTPStatusError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"slack_http_status_{exc.response.status_code}",
                latency_ms=elapsed,
            )
        except httpx.HTTPError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"slack_http_error:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        return success_result(latency_ms=elapsed)
