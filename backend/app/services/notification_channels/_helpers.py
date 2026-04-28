"""Shared helpers for the Phase 3 channel adapters.

The webhook-based channels (Slack/Discord/Teams) all need:
* a single ``httpx.AsyncClient`` configured with the same timeout +
  user-agent so log scraping picks them up consistently;
* domain whitelisting that fails fast rather than letting users wire up an
  arbitrary URL through the channel form (mirrors the SSRF defence used by
  the monitor probe);
* a way to render the "View monitor" deep link without coupling each
  adapter to ``settings`` / ``CORS_ORIGINS``.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx
import structlog

from app.core.config import settings
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelDispatchResult,
)

logger = structlog.get_logger(__name__)

# Surfaced as ``X-Sent-By`` so log scrapers / receivers can attribute requests.
NOTIFICATION_USER_AGENT = "OrbiCheck-Notifications/1.0"
SEVERITY_COLOUR_HEX: dict[str, str] = {
    "critical": "#dc2626",
    "warning": "#f59e0b",
    "info": "#2563eb",
}
SEVERITY_COLOUR_INT: dict[str, int] = {
    "critical": 0xDC2626,
    "warning": 0xF59E0B,
    "info": 0x2563EB,
}
DEFAULT_SEVERITY_COLOUR_HEX = "#2563eb"
DEFAULT_SEVERITY_COLOUR_INT = 0x2563EB

# https://www.rfc-editor.org/rfc/rfc1123 — keep the host check coarse but
# typed; the per-channel allowlist below does the real work.
_HOSTNAME_ALLOWED_CHARS = re.compile(r"^[A-Za-z0-9.\-]+$")


def severity_colour_hex(severity: str) -> str:
    return SEVERITY_COLOUR_HEX.get(severity, DEFAULT_SEVERITY_COLOUR_HEX)


def severity_colour_int(severity: str) -> int:
    return SEVERITY_COLOUR_INT.get(severity, DEFAULT_SEVERITY_COLOUR_INT)


def _public_origin() -> str:
    base = (settings.PUBLIC_BASE_URL or "").strip().rstrip("/")
    if base:
        return base
    if settings.CORS_ORIGINS:
        first = str(settings.CORS_ORIGINS[0]).strip().rstrip("/")
        if first.startswith("http"):
            return first
    return ""


def render_monitor_link(payload: AlertPayload) -> str:
    """Resolve the dashboard deep-link for a monitor alert."""

    if payload.monitor_url_dashboard:
        return payload.monitor_url_dashboard
    origin = _public_origin()
    if not origin:
        return ""
    return f"{origin}/dashboard/monitor/{payload.monitor_id}"


def validate_https_url(value: str) -> str:
    """Strict HTTPS-only URL check used by Slack/Discord/Teams config forms.

    Returns the trimmed URL on success and raises ``ValueError`` otherwise.
    Channel adapters call this both at config time (rejecting bad inputs
    before save) and again at send time so a stale config can't escape.
    """

    if not isinstance(value, str):
        raise ValueError("URL must be a string")
    candidate = value.strip()
    if not candidate:
        raise ValueError("URL is required")
    parsed = urlparse(candidate)
    if parsed.scheme != "https":
        raise ValueError("URL must use HTTPS")
    if not parsed.hostname:
        raise ValueError("URL has no hostname")
    if not _HOSTNAME_ALLOWED_CHARS.match(parsed.hostname):
        raise ValueError("URL hostname contains invalid characters")
    return candidate


def url_matches_allowed_hosts(url: str, allowed_suffixes: tuple[str, ...]) -> bool:
    """Return True when ``url``'s hostname ends with any of the allowed
    suffixes. Used by per-channel SSRF guards."""

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    for suffix in allowed_suffixes:
        normalised = suffix.lower().lstrip(".")
        if host == normalised or host.endswith(f".{normalised}"):
            return True
    return False


async def post_json(
    url: str,
    body: dict,
    *,
    expected_status: tuple[int, ...] = (200, 201, 202, 204),
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, str]:
    """POST ``body`` as JSON and return ``(status_code, response_text)``.

    Network errors are surfaced as ``httpx.HTTPError`` for the caller to
    convert into a :class:`ChannelDispatchResult`. Channels MUST NOT log
    response bodies (they may contain user-controlled data — the dispatch
    log already captures the outbound payload).
    """

    headers = {"User-Agent": NOTIFICATION_USER_AGENT}
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient(
        timeout=settings.NOTIFICATION_CHANNEL_TIMEOUT_S
    ) as client:
        response = await client.post(url, json=body, headers=headers)
        if response.status_code not in expected_status:
            raise httpx.HTTPStatusError(
                f"Unexpected status {response.status_code}",
                request=response.request,
                response=response,
            )
        return response.status_code, response.text


def failure_result(
    *, error: str, latency_ms: int, attempt: int = 1
) -> ChannelDispatchResult:
    return ChannelDispatchResult(
        success=False,
        error=error[:500],
        latency_ms=latency_ms,
        attempt=attempt,
    )


def success_result(*, latency_ms: int, attempt: int = 1) -> ChannelDispatchResult:
    return ChannelDispatchResult(
        success=True,
        error=None,
        latency_ms=latency_ms,
        attempt=attempt,
    )


def skipped_result(*, reason: str, attempt: int = 1) -> ChannelDispatchResult:
    return ChannelDispatchResult(
        success=True,
        error=None,
        latency_ms=0,
        attempt=attempt,
        skipped_reason=reason,
    )


def log_send_error(channel_id: str, *, error: BaseException) -> None:
    logger.warning(
        "notification_channel_send_failed",
        channel_id=channel_id,
        error=str(error)[:200],
    )
