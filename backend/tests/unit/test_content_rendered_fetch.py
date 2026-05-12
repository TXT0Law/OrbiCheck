"""Unit tests for the C-5 rendered-DOM fetch helper."""

from __future__ import annotations

import pytest
import respx
from httpx import Response

from app.core.config import settings
from app.services.content_rendered_fetch import (
    RenderedFetchError,
    RenderedFetchOptions,
    fetch_rendered_dom,
    get_rendered_fetch_options,
    is_rendered_dom_enabled,
)


@pytest.fixture(autouse=True)
def _enable_rendered_dom_globally(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        settings, "MONITOR_RENDERED_DOM_PIPELINE_ENABLED", True
    )


def test_is_rendered_dom_enabled_requires_browser_mode() -> None:
    assert is_rendered_dom_enabled(None) is False
    assert (
        is_rendered_dom_enabled(
            {"content_change": {"thresholds": {"fetchMode": "http"}}}
        )
        is False
    )
    assert (
        is_rendered_dom_enabled(
            {"content_change": {"thresholds": {"fetchMode": "browser"}}}
        )
        is True
    )


def test_is_rendered_dom_disabled_when_global_flag_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings, "MONITOR_RENDERED_DOM_PIPELINE_ENABLED", False
    )
    assert (
        is_rendered_dom_enabled(
            {"content_change": {"thresholds": {"fetchMode": "browser"}}}
        )
        is False
    )


def test_get_rendered_fetch_options_defaults() -> None:
    opts = get_rendered_fetch_options(None)
    assert opts == RenderedFetchOptions()


def test_get_rendered_fetch_options_parses_known_keys() -> None:
    caps = {
        "content_change": {
            "thresholds": {
                "fetchOptions": {
                    "waitForSelector": "main h1",
                    "waitMs": 250,
                    "viewportWidth": 1024,
                    "viewportHeight": 800,
                }
            }
        }
    }
    opts = get_rendered_fetch_options(caps)
    assert opts.wait_for_selector == "main h1"
    assert opts.wait_ms == 250
    assert opts.viewport_width == 1024
    assert opts.viewport_height == 800


@pytest.mark.asyncio
async def test_fetch_rendered_dom_returns_httpx_shaped_object() -> None:
    base = settings.SCAN_SERVICE_URL.rstrip("/")
    expected_html = "<html><body><h1>Hello</h1></body></html>"
    payload = {
        "success": True,
        "data": {
            "html": expected_html,
            "statusCode": 200,
            "contentType": "text/html; rendered=true",
        },
    }
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{base}/api/scan/page-source-rendered").mock(
            return_value=Response(200, json=payload)
        )
        response = await fetch_rendered_dom(
            "https://example.com",
            options=RenderedFetchOptions(),
            monitor_id="mon-1",
        )
    assert response.status_code == 200
    assert response.text == expected_html
    assert response.headers["content-type"].startswith("text/html")


@pytest.mark.asyncio
async def test_fetch_rendered_dom_raises_on_unsuccessful_envelope() -> None:
    base = settings.SCAN_SERVICE_URL.rstrip("/")
    payload = {"success": False, "error": "browser exploded"}
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{base}/api/scan/page-source-rendered").mock(
            return_value=Response(200, json=payload)
        )
        with pytest.raises(RenderedFetchError) as excinfo:
            await fetch_rendered_dom(
                "https://example.com",
                options=RenderedFetchOptions(),
            )
    assert "browser exploded" in str(excinfo.value)


@pytest.mark.asyncio
async def test_fetch_rendered_dom_raises_on_5xx() -> None:
    base = settings.SCAN_SERVICE_URL.rstrip("/")
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{base}/api/scan/page-source-rendered").mock(
            return_value=Response(503, text="upstream down")
        )
        with pytest.raises(RenderedFetchError):
            await fetch_rendered_dom(
                "https://example.com",
                options=RenderedFetchOptions(),
            )
