from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import scan_client


def _response(
    status_code: int,
    *,
    json_data: dict[str, Any] | None = None,
    url: str = "http://scan.local/api",
) -> httpx.Response:
    request = httpx.Request("GET", url)
    return httpx.Response(status_code, json=json_data, request=request)


class _AsyncClientStub:
    def __init__(self, get: AsyncMock, post: AsyncMock | None = None) -> None:
        self.get = get
        self.post = post or AsyncMock()

    async def __aenter__(self) -> _AsyncClientStub:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_scan_module_returns_status_and_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get = AsyncMock(
        return_value=_response(200, json_data={"success": True, "data": {"grade": "A"}})
    )
    monkeypatch.setattr(scan_client.httpx, "AsyncClient", lambda **_: _AsyncClientStub(get))

    result = await scan_client.call_scan_module("ssl", "https://example.com")

    assert result["status_code"] == 200
    assert result["data"]["success"] is True
    assert result["data"]["data"]["grade"] == "A"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_scan_module_propagates_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    monkeypatch.setattr(scan_client.httpx, "AsyncClient", lambda **_: _AsyncClientStub(get))

    with pytest.raises(httpx.TimeoutException):
        await scan_client.call_scan_module("ssl", "https://example.com")


@pytest.mark.unit
def test_build_missing_module_result_returns_expected_shape() -> None:
    result = scan_client._build_missing_module_result("dns-server")

    assert result["success"] is False
    assert result["statusCode"] == 404
    assert result["durationMs"] == 0
    assert "not available" in result["data"]["error"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_scan_batch_merges_remote_and_missing_modules(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get = AsyncMock(
        return_value=_response(200, json_data={"modules": ["ssl", "headers"]})
    )
    post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={
                "results": {
                    "ssl": {"success": True},
                    "headers": {"success": False},
                }
            },
            request=httpx.Request("POST", "http://scan.local/api/scan/batch"),
        )
    )
    monkeypatch.setattr(
        scan_client.httpx, "AsyncClient", lambda **_: _AsyncClientStub(get, post)
    )

    result = await scan_client.call_scan_batch(
        "https://example.com", ["ssl", "headers", "dns-server"]
    )

    assert result["totalModules"] == 3
    assert result["successCount"] == 1
    assert result["failedCount"] == 2
    assert result["results"]["dns-server"]["statusCode"] == 404


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_scan_batch_falls_back_when_registry_lookup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get = AsyncMock(side_effect=httpx.ConnectError("down"))
    post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"results": {"ssl": {"success": True}}},
            request=httpx.Request("POST", "http://scan.local/api/scan/batch"),
        )
    )
    monkeypatch.setattr(
        scan_client.httpx, "AsyncClient", lambda **_: _AsyncClientStub(get, post)
    )

    result = await scan_client.call_scan_batch("https://example.com", ["ssl"])

    assert result["totalModules"] == 1
    assert result["successCount"] == 1
    post.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_screenshot_service_returns_json_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get = AsyncMock(
        return_value=_response(200, json_data={"image": "base64-image"}, url="http://scan")
    )
    monkeypatch.setattr(scan_client.httpx, "AsyncClient", lambda **_: _AsyncClientStub(get))

    result = await scan_client.call_screenshot_service(
        "https://example.com",
        viewport_width=1280,
        viewport_height=720,
        full_page=True,
    )

    assert result["image"] == "base64-image"
    assert get.await_args.kwargs["params"]["fullPage"] == "true"
