"""C-5: Rendered DOM fetch for content_change monitors.

The standard content_change pipeline issues an httpx request and hashes the
response body. That works for static / SSR pages, but JS-rendered SPAs
emit nearly empty markup at request time — so OrbiCheck either always
"sees" the same shell or constantly false-positives on initial loading
HTML.

Rendered fetch routes the request through the scan-service's Playwright
browser pool (``/api/scan/page-source-rendered``) and returns a body that
mimics ``httpx.Response`` enough for the existing helpers
(``validate_content_response``, ``compute_content_fingerprint``, etc.) to
work unchanged.

The fake response intentionally exposes only the surface those helpers
read; injecting a full ``httpx.Response`` would require a transport.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

import httpx
import structlog

from app.core.config import settings
from app.core.internal_auth import InternalServiceAuth

logger = structlog.get_logger(__name__)

# Path on the scan-service that returns a Playwright-rendered HTML body.
RENDERED_PATH = "/api/scan/page-source-rendered"

# Minimum check interval when ``fetchMode == "browser"`` to bound Chromium load.
# Per-check Playwright launches are heavy (≥ 200 MB RSS, ~700 ms cold) so a
# 60 s monitor would saturate the chromium pool and starve the rest of the
# scan-service. Both the API schema (MonitorCreateRequest /
# MonitorUpdateRequest) and the runtime probe path enforce this bound.
MIN_BROWSER_FETCH_INTERVAL_SECONDS = 300


class RenderedFetchError(Exception):
    """Raised when the rendered fetch pipeline cannot return usable HTML."""


@dataclass(frozen=True)
class RenderedFetchOptions:
    """Per-monitor knobs read out of ``capabilities.content_change.thresholds``."""

    wait_for_selector: str | None = None
    wait_ms: int | None = None
    viewport_width: int | None = None
    viewport_height: int | None = None


def is_rendered_dom_enabled(capabilities: dict[str, Any] | None) -> bool:
    """Return True when the monitor explicitly opts in to rendered fetch.

    Two gates must both be on: the global server flag
    ``MONITOR_RENDERED_DOM_PIPELINE_ENABLED`` and the per-monitor
    ``content_change.thresholds.fetchMode == "browser"``. The server flag
    lets operators disable the feature globally without rewriting every
    monitor's capability blob.
    """
    if not settings.MONITOR_RENDERED_DOM_PIPELINE_ENABLED:
        return False
    caps = capabilities or {}
    raw_cc = caps.get("content_change") if isinstance(caps, dict) else None
    if not isinstance(raw_cc, dict):
        return False
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        return False
    return str(th.get("fetchMode") or "http").lower() == "browser"


def get_rendered_fetch_options(
    capabilities: dict[str, Any] | None,
) -> RenderedFetchOptions:
    caps = capabilities or {}
    raw_cc = caps.get("content_change") if isinstance(caps, dict) else {}
    th = raw_cc.get("thresholds") if isinstance(raw_cc, dict) else {}
    fetch_options = th.get("fetchOptions") if isinstance(th, dict) else None
    if not isinstance(fetch_options, dict):
        return RenderedFetchOptions()
    selector = fetch_options.get("waitForSelector")
    wait_ms = fetch_options.get("waitMs")
    width = fetch_options.get("viewportWidth")
    height = fetch_options.get("viewportHeight")
    return RenderedFetchOptions(
        wait_for_selector=str(selector) if isinstance(selector, str) and selector.strip() else None,
        wait_ms=int(wait_ms) if isinstance(wait_ms, (int, float)) and int(wait_ms) >= 0 else None,
        viewport_width=int(width) if isinstance(width, (int, float)) and int(width) > 0 else None,
        viewport_height=int(height) if isinstance(height, (int, float)) and int(height) > 0 else None,
    )


class RenderedHttpxResponse:
    """Minimal duck-typed stand-in for ``httpx.Response``.

    The downstream helpers only read ``status_code``, ``text``, ``headers``,
    ``encoding``, and ``aclose``; everything else is absent on purpose to
    fail loud if a future caller assumes a real Response.
    """

    def __init__(
        self,
        *,
        status_code: int,
        body: str,
        headers: Mapping[str, str],
        encoding: str = "utf-8",
    ) -> None:
        self.status_code = int(status_code)
        self._body = body
        self.headers = dict(headers)
        self.encoding = encoding

    @property
    def text(self) -> str:
        return self._body

    async def aclose(self) -> None:  # API parity with httpx.Response
        return None


async def fetch_rendered_dom(
    url: str,
    *,
    options: RenderedFetchOptions,
    monitor_id: str | None = None,
) -> RenderedHttpxResponse:
    """Call the scan-service rendered endpoint and return an httpx-shaped object.

    Raises :class:`RenderedFetchError` on transport / payload problems so the
    caller can fall back to the cheap HTTP path or surface a probe error.
    """
    base = settings.SCAN_SERVICE_URL.rstrip("/")
    timeout = httpx.Timeout(
        max(float(settings.MONITOR_SCREENSHOT_TIMEOUT_S), 5.0),
        connect=10.0,
    )
    params: dict[str, str] = {"url": url}
    if options.wait_for_selector:
        params["waitForSelector"] = options.wait_for_selector
    if options.wait_ms is not None:
        params["waitForMs"] = str(int(options.wait_ms))
    if options.viewport_width is not None:
        params["viewportWidth"] = str(int(options.viewport_width))
    if options.viewport_height is not None:
        params["viewportHeight"] = str(int(options.viewport_height))

    headers: dict[str, str] = {}
    if monitor_id:
        # Reuse the same trace header convention the scan_client uses so the
        # scan-service log lines are scoped to this monitor.
        headers["X-Scan-Id"] = f"monitor-{monitor_id}"
        headers["X-Trace-Id"] = f"monitor-{monitor_id}"

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
            auth=InternalServiceAuth(settings.INTERNAL_SERVICE_SECRET),
        ) as client:
            response = await client.get(f"{base}{RENDERED_PATH}", params=params)
    except httpx.HTTPError as exc:
        raise RenderedFetchError(f"Rendered DOM fetch transport failed: {exc}") from exc

    if response.status_code >= 500:
        raise RenderedFetchError(
            f"Rendered DOM fetch returned HTTP {response.status_code}"
        )

    try:
        envelope = response.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise RenderedFetchError(
            f"Rendered DOM fetch returned non-JSON payload: {exc}"
        ) from exc

    if not envelope.get("success"):
        err = envelope.get("error") or "rendered fetch unsuccessful"
        raise RenderedFetchError(str(err))

    data = envelope.get("data") or {}
    html = data.get("html")
    if not isinstance(html, str):
        raise RenderedFetchError("Rendered DOM payload missing html field")
    upstream_status = data.get("statusCode")
    try:
        status_code = int(upstream_status) if upstream_status is not None else 200
    except (TypeError, ValueError):
        status_code = 200
    content_type = (
        data.get("contentType") if isinstance(data.get("contentType"), str)
        else "text/html"
    )
    return RenderedHttpxResponse(
        status_code=status_code,
        body=html,
        headers={"content-type": content_type},
    )
