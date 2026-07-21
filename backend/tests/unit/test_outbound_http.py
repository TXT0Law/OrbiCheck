from __future__ import annotations

import hashlib
import hmac
import ipaddress
import socket

import httpx
import pytest

from app.core.internal_auth import InternalServiceAuth
from app.services import outbound_http
from app.services.outbound_http import OutboundRequestBlocked, request_safely
from app.utils.url_safety import ResolvedPublicUrl


def _resolved(url: str, address: str = "93.184.216.34") -> ResolvedPublicUrl:
    parsed = httpx.URL(url)
    return ResolvedPublicUrl(
        url=url,
        hostname=parsed.host,
        port=parsed.port or 443,
        addresses=(ipaddress.ip_address(address),),
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_request_safely_pins_connection_and_preserves_tls_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        outbound_http,
        "resolve_public_url",
        lambda url, require_https=False: _resolved(url),
    )
    observed: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        observed["host"] = request.url.host
        observed["host_header"] = request.headers["host"]
        observed["sni"] = request.extensions["sni_hostname"]
        return httpx.Response(200, text="ok")

    response = await request_safely(
        "GET",
        "https://example.com/path",
        transport=httpx.MockTransport(handler),
        pin_dns=True,
    )

    assert response.status_code == 200
    assert observed == {
        "host": "93.184.216.34",
        "host_header": "example.com",
        "sni": "example.com",
    }


@pytest.mark.unit
@pytest.mark.asyncio
async def test_request_safely_revalidates_and_blocks_redirect_destination(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def resolve(url: str, require_https: bool = False) -> ResolvedPublicUrl:
        _ = require_https
        if "169.254.169.254" in url:
            raise ValueError("URL resolves to blocked network: 169.254.169.254")
        return _resolved(url)

    monkeypatch.setattr(outbound_http, "resolve_public_url", resolve)
    requests = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(
            302,
            headers={"Location": "http://169.254.169.254/latest/meta-data"},
        )

    with pytest.raises(OutboundRequestBlocked, match="blocked network"):
        await request_safely(
            "GET",
            "https://example.com/start",
            transport=httpx.MockTransport(handler),
        )
    assert requests == 1


@pytest.mark.unit
def test_url_policy_rejects_mixed_public_private_dns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.utils import url_safety

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.7", 443)),
        ],
    )

    with pytest.raises(ValueError, match="blocked network"):
        url_safety.resolve_public_url("https://mixed.example")


@pytest.mark.unit
@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/",
        "http://[fe80::1]/",
        "http://user:password@example.com/",
    ],
)
def test_url_policy_rejects_special_destinations(url: str) -> None:
    from app.utils.url_safety import resolve_public_url

    with pytest.raises(ValueError):
        resolve_public_url(url)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_internal_service_auth_signs_prepared_method_target_and_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core import internal_auth

    timestamp = 1_700_000_000
    secret = "test-internal-service-secret"
    body = b'{"url":"https://example.com"}'
    monkeypatch.setattr(internal_auth.time, "time", lambda: timestamp)

    async def handler(request: httpx.Request) -> httpx.Response:
        payload = (
            f"v1\n{timestamp}\nPOST\n/api/scan/batch?mode=fast\n"
            f"{hashlib.sha256(body).hexdigest()}"
        ).encode()
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        assert request.headers["X-Orbi-Signature"] == f"v1={expected}"
        assert request.headers["X-Orbi-Timestamp"] == str(timestamp)
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        auth=InternalServiceAuth(secret),
    ) as client:
        response = await client.post(
            "http://scan-service:4000/api/scan/batch?mode=fast",
            content=body,
        )

    assert response.json() == {"ok": True}
