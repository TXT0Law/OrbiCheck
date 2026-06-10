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
def test_resolve_batch_timeout_scales_with_batch_complexity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(scan_client.settings, "SCAN_TIMEOUT_MS", 60_000)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_CONCURRENCY", 4)
    monkeypatch.setattr(scan_client.settings, "SCAN_HOST_CONCURRENCY", 4)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_TIMEOUT_MAX_S", 300.0)

    one_module = scan_client.resolve_batch_timeout_s(["headers"])
    medium_batch = scan_client.resolve_batch_timeout_s(
        ["headers", "status", "screenshot", "tech-stack"]
    )
    heavy_batch = scan_client.resolve_batch_timeout_s(
        ["headers", "status", "screenshot", "tech-stack", "ports", "tls", "cookies"]
    )

    assert one_module >= 60.0
    assert medium_batch > one_module
    assert heavy_batch > medium_batch


@pytest.mark.unit
def test_resolve_batch_timeout_is_bounded_by_configured_max(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(scan_client.settings, "SCAN_TIMEOUT_MS", 60_000)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_CONCURRENCY", 1)
    monkeypatch.setattr(scan_client.settings, "SCAN_HOST_CONCURRENCY", 1)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_TIMEOUT_MAX_S", 90.0)

    timeout_s = scan_client.resolve_batch_timeout_s(
        ["screenshot", "tech-stack", "ports", "tls", "cookies"]
    )

    assert timeout_s == 90.0


@pytest.mark.unit
def test_resolve_batch_timeout_uses_effective_host_concurrency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(scan_client.settings, "SCAN_TIMEOUT_MS", 60_000)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_CONCURRENCY", 10)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_TIMEOUT_MAX_S", 300.0)
    modules = ["headers", "status", "whois", "screenshot", "tech-stack"]

    monkeypatch.setattr(scan_client.settings, "SCAN_HOST_CONCURRENCY", 10)
    batch_only_timeout_s = scan_client.resolve_batch_timeout_s(modules)
    monkeypatch.setattr(scan_client.settings, "SCAN_HOST_CONCURRENCY", 2)
    host_limited_timeout_s = scan_client.resolve_batch_timeout_s(modules)

    assert host_limited_timeout_s > batch_only_timeout_s


@pytest.mark.unit
def test_resolve_batch_timeout_sums_module_budget_waves(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(scan_client.settings, "SCAN_TIMEOUT_MS", 60_000)
    monkeypatch.setattr(scan_client.settings, "MODULE_TIMEOUT_MS", 30_000)
    monkeypatch.setattr(scan_client.settings, "EXTENDED_MODULE_TIMEOUT_MS", 60_000)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_CONCURRENCY", 10)
    monkeypatch.setattr(scan_client.settings, "SCAN_HOST_CONCURRENCY", 6)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_TIMEOUT_MAX_S", 300.0)

    timeout_s = scan_client.resolve_batch_timeout_s(
        [
            "ssl",
            "tls",
            "whois",
            "associated-hosts",
            "dnssec",
            "firewall",
            "cookies",
            "redirects",
            "mail-config",
            "http-security",
            "rank",
            "carbon",
            "linked-pages",
            "archives",
            "block-lists",
            "legacy-rank",
        ]
    )

    assert timeout_s >= 120.0


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
async def test_call_scan_batch_uses_resolved_batch_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    get = AsyncMock(return_value=_response(200, json_data={"modules": ["screenshot"]}))
    post = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"results": {"screenshot": {"success": True}}},
            request=httpx.Request("POST", "http://scan.local/api/scan/batch"),
        )
    )

    def _client_factory(**kwargs: Any) -> _AsyncClientStub:
        captured["timeout"] = kwargs.get("timeout")
        return _AsyncClientStub(get, post)

    monkeypatch.setattr(scan_client.settings, "SCAN_TIMEOUT_MS", 60_000)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_CONCURRENCY", 1)
    monkeypatch.setattr(scan_client.settings, "SCAN_HOST_CONCURRENCY", 1)
    monkeypatch.setattr(scan_client.settings, "SCAN_BATCH_TIMEOUT_MAX_S", 300.0)
    monkeypatch.setattr(scan_client.httpx, "AsyncClient", _client_factory)

    await scan_client.call_scan_batch(
        "https://example.com",
        ["screenshot"],
        scan_id="scan-1",
    )

    assert isinstance(captured["timeout"], httpx.Timeout)
    assert captured["timeout"].read > 60.0


class _SyncClientStub:
    def __init__(self, get) -> None:  # type: ignore[no-untyped-def]
        self.get = get

    def __enter__(self) -> "_SyncClientStub":
        return self

    def __exit__(self, *_args: object) -> None:
        return None


@pytest.mark.unit
def test_call_scan_module_sync_envelope_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B-9 / S-10: success path returns the same envelope shape as the batch helper."""
    request = httpx.Request("GET", "http://scan.local/api/scan/ssl")
    response = httpx.Response(
        200,
        json={"success": True, "data": {"grade": "A"}, "durationMs": 42, "statusCode": 200},
        request=request,
    )
    get = lambda *_a, **_kw: response  # noqa: E731 — short stub
    monkeypatch.setattr(
        scan_client.httpx, "Client", lambda **_kw: _SyncClientStub(get)
    )

    envelope = scan_client.call_scan_module_sync("ssl", "https://example.com")

    assert envelope["success"] is True
    assert envelope["statusCode"] == 200
    assert envelope["data"] == {"grade": "A"}
    assert envelope["durationMs"] == 42
    assert "error" not in envelope


@pytest.mark.unit
def test_call_scan_module_sync_failed_envelope_carries_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B-9 / S-10: a failed module returns success=false with `error` populated."""
    request = httpx.Request("GET", "http://scan.local/api/scan/whois")
    response = httpx.Response(
        200,
        json={
            "success": False,
            "data": {"error": "WHOIS rate limited"},
            "error": "WHOIS rate limited",
            "durationMs": 12_345,
            "statusCode": 200,
        },
        request=request,
    )
    monkeypatch.setattr(
        scan_client.httpx,
        "Client",
        lambda **_kw: _SyncClientStub(lambda *_a, **_kw: response),
    )

    envelope = scan_client.call_scan_module_sync("whois", "https://example.com")

    assert envelope["success"] is False
    assert envelope["error"] == "WHOIS rate limited"
    assert envelope["data"]["error"] == "WHOIS rate limited"


@pytest.mark.unit
def test_call_scan_module_sync_handles_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B-9 / S-10: connection errors must surface as a failure envelope, not raise."""

    def _raise(*_a: object, **_kw: object) -> None:
        raise httpx.ConnectError("scan-service unreachable")

    monkeypatch.setattr(
        scan_client.httpx, "Client", lambda **_kw: _SyncClientStub(_raise)
    )

    envelope = scan_client.call_scan_module_sync("ssl", "https://example.com")

    assert envelope["success"] is False
    assert envelope["statusCode"] == 599
    assert "scan-service unreachable" in envelope["error"]


@pytest.mark.unit
def test_call_scan_module_sync_forwards_scan_options(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B-9 / S-10: scalar scanOptions become query string params on the GET."""
    captured: dict[str, Any] = {}
    request = httpx.Request("GET", "http://scan.local/api/scan/ports")
    response = httpx.Response(
        200,
        json={"success": True, "data": {}, "durationMs": 0, "statusCode": 200},
        request=request,
    )

    def _get(*_args: object, **kwargs: object) -> httpx.Response:
        captured["params"] = kwargs.get("params")
        return response

    monkeypatch.setattr(
        scan_client.httpx, "Client", lambda **_kw: _SyncClientStub(_get)
    )

    scan_client.call_scan_module_sync(
        "ports",
        "https://example.com",
        {"deep": True, "extra": "x", "ignored": [1, 2, 3]},
        timeout_s=5.0,
    )

    params = captured["params"]
    assert params["url"] == "https://example.com"
    assert params["deep"] == "True"
    assert params["extra"] == "x"
    # Non-scalar values are intentionally dropped to avoid building a giant
    # query string for nested option blobs.
    assert "ignored" not in params


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_screenshot_service_returns_json_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    post = AsyncMock(
        return_value=_response(200, json_data={"image": "base64-image"}, url="http://scan")
    )
    monkeypatch.setattr(scan_client.httpx, "AsyncClient", lambda **_: _AsyncClientStub(AsyncMock(), post))

    result = await scan_client.call_screenshot_service(
        "https://example.com",
        viewport_width=1280,
        viewport_height=720,
        full_page=True,
    )

    assert result["image"] == "base64-image"
    assert post.await_args.kwargs["json"]["fullPage"] is True
    assert post.await_args.kwargs["json"]["viewportWidth"] == 1280
