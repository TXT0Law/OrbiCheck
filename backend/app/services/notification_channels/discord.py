"""Discord incoming-webhook channel adapter (Phase 3.3)."""

from __future__ import annotations

import time

import httpx
import structlog

from app.services.notification_channels._helpers import (
    failure_result,
    log_send_error,
    post_json,
    render_monitor_link,
    severity_colour_int,
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

CHANNEL_ID = "discord"
DISCORD_ALLOWED_HOSTS: tuple[str, ...] = (
    "discord.com",
    "discordapp.com",
    "ptb.discord.com",
    "canary.discord.com",
)
DISCORD_EMBED_PATH_PREFIX = "/api/webhooks/"
DISCORD_DESCRIPTION_MAX = 2000


def validate_target_url(url: str) -> str:
    candidate = validate_https_url(url)
    if not url_matches_allowed_hosts(candidate, DISCORD_ALLOWED_HOSTS):
        raise ValueError(
            "Discord webhook URL must point at discord.com / discordapp.com"
        )
    if DISCORD_EMBED_PATH_PREFIX not in candidate:
        raise ValueError(
            "Discord webhook URL must include /api/webhooks/{id}/{token}"
        )
    return candidate


def _build_embed(payload: AlertPayload) -> dict:
    severity_label = payload.severity.upper()
    description = payload.message[:DISCORD_DESCRIPTION_MAX]
    fields = [
        {"name": "Capability", "value": payload.capability, "inline": True},
        {"name": "Severity", "value": severity_label, "inline": True},
    ]
    if payload.actual_value:
        fields.append(
            {
                "name": "Detected",
                "value": payload.actual_value[:1024],
                "inline": False,
            }
        )
    embed: dict = {
        "title": f"OrbiCheck — {payload.monitor_name}",
        "description": description,
        "color": severity_colour_int(payload.severity),
        "fields": fields,
    }
    deep_link = render_monitor_link(payload)
    if deep_link:
        embed["url"] = deep_link
    if payload.created_at is not None:
        # Discord parses ISO-8601 timestamps; keep ms precision out so the
        # webhook accepts the value across older API versions too.
        embed["timestamp"] = payload.created_at.isoformat()
    return embed


def _build_payload(payload: AlertPayload) -> dict:
    fallback = (
        f"[{payload.severity.upper()}] {payload.monitor_name}: {payload.message}"
    )[:1900]
    return {
        "username": "OrbiCheck",
        "content": fallback,
        "embeds": [_build_embed(payload)],
    }


class DiscordChannel:
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
        body = _build_payload(payload)
        started = time.perf_counter()
        try:
            await post_json(target, body)
        except httpx.HTTPStatusError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"discord_http_status_{exc.response.status_code}",
                latency_ms=elapsed,
            )
        except httpx.HTTPError as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            log_send_error(self.channel_id, error=exc)
            return failure_result(
                error=f"discord_http_error:{exc.__class__.__name__}",
                latency_ms=elapsed,
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        return success_result(latency_ms=elapsed)
