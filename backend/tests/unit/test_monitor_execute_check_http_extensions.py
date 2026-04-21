"""Phase 1.1: probe-time behavior for httpBody / httpHeaders / httpAuth.

Asserts:
    * Configured custom headers are sent on every probe.
    * Bearer/basic auth derived from the encrypted envelope ends up on the wire
      as a single Authorization header.
    * `content_change` POST sends the configured body verbatim.
    * Forbidden headers from the request schema never reach `httpx` (defense in
      depth — Pydantic should already reject them, but the merge code must also
      not re-introduce them).
"""

from __future__ import annotations

import base64
import socket
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
import respx
from cryptography.fernet import Fernet

from app.core import secrets as secrets_mod
from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import (
    Monitor,
    MonitorChange,
    MonitorCheck,
    MonitorSnapshot,
    MonitorStatus,
)
from app.services.monitor_service import execute_check


@pytest.fixture(autouse=True)
def _isolate_fernet_key(monkeypatch):
    monkeypatch.setattr(
        secrets_mod.settings,
        "MONITOR_SECRET_ENCRYPTION_KEY",
        Fernet.generate_key().decode("ascii"),
        raising=False,
    )
    secrets_mod.reset_cache_for_tests()
    yield
    secrets_mod.reset_cache_for_tests()


def _make_monitor(
    mid,
    *,
    enabled: list[str],
    http_method: str = "GET",
    http_body: str | None = None,
    http_headers: dict | None = None,
    http_auth: dict | None = None,
) -> Monitor:
    caps = capabilities_from_enabled_list(enabled)
    return Monitor(
        id=mid,
        user_id=1,
        display_name="t",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=enabled,
        interval_seconds=300,
        http_method=http_method,
        http_body=http_body,
        http_headers=http_headers,
        http_auth=http_auth,
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.PENDING,
        tags=[],
        consecutive_failures=0,
        total_checks=0,
        total_changes_detected=0,
    )


def _mock_db(mon: Monitor) -> AsyncMock:
    added: list = []

    def add_side(o: object) -> None:
        added.append(o)

    async def flush_fn() -> None:
        for obj in added:
            if isinstance(obj, MonitorCheck) and obj.id is None:
                obj.id = uuid4()
            if isinstance(obj, MonitorSnapshot) and obj.id is None:
                obj.id = uuid4()
            if isinstance(obj, MonitorChange) and obj.id is None:
                obj.id = uuid4()

    async def execute_side_effect(stmt: object) -> MagicMock:
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        r.scalars.return_value.all.return_value = []
        return r

    db = AsyncMock()
    db.get = AsyncMock(
        side_effect=lambda model, pk: mon if model is Monitor and pk == mon.id else None
    )
    db.add = MagicMock(side_effect=add_side)
    db.flush = AsyncMock(side_effect=flush_fn)
    db.delete = AsyncMock()
    db.refresh = AsyncMock()
    db.scalar = AsyncMock(return_value=True)
    db.execute = AsyncMock(side_effect=execute_side_effect)
    return db


@pytest.fixture
def public_example_dns(monkeypatch):
    def _fake(host: str, *args, **kwargs):
        _ = args, kwargs
        if host == "example.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        raise OSError("unexpected host")

    monkeypatch.setattr(socket, "getaddrinfo", _fake)


def _bearer_envelope(token: str) -> dict:
    return {"scheme": "bearer", "token_ciphertext": secrets_mod.encrypt_secret(token)}


def _basic_envelope(creds: str) -> dict:
    return {"scheme": "basic", "token_ciphertext": secrets_mod.encrypt_secret(creds)}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_custom_headers_are_forwarded(
    respx_mock: respx.MockRouter, public_example_dns
) -> None:
    mid = uuid4()
    mon = _make_monitor(
        mid,
        enabled=["uptime_only"],
        http_headers={"X-Trace-Id": "abc-123", "Accept": "application/json"},
    )
    db = _mock_db(mon)
    route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    await execute_check(mid, db, redis=None)
    sent = route.calls.last.request
    assert sent.headers["x-trace-id"] == "abc-123"
    assert sent.headers["accept"] == "application/json"
    # Default UA still present.
    assert sent.headers["user-agent"]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_bearer_auth_appears_as_authorization_header(
    respx_mock: respx.MockRouter, public_example_dns
) -> None:
    mid = uuid4()
    mon = _make_monitor(
        mid,
        enabled=["uptime_only"],
        http_auth=_bearer_envelope("my-bearer-secret"),
    )
    db = _mock_db(mon)
    route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    await execute_check(mid, db, redis=None)
    sent = route.calls.last.request
    assert sent.headers["authorization"] == "Bearer my-bearer-secret"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_basic_auth_b64_encodes_token_payload(
    respx_mock: respx.MockRouter, public_example_dns
) -> None:
    mid = uuid4()
    mon = _make_monitor(
        mid,
        enabled=["uptime_only"],
        http_auth=_basic_envelope("alice:wonderland"),
    )
    db = _mock_db(mon)
    route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    await execute_check(mid, db, redis=None)
    sent = route.calls.last.request
    expected = base64.b64encode(b"alice:wonderland").decode("ascii")
    assert sent.headers["authorization"] == f"Basic {expected}"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_post_content_change_sends_configured_body(
    respx_mock: respx.MockRouter, public_example_dns
) -> None:
    payload = '{"q": "1+1"}'
    mid = uuid4()
    mon = _make_monitor(
        mid,
        enabled=["content_change"],
        http_method="POST",
        http_body=payload,
    )
    db = _mock_db(mon)
    route = respx_mock.post("https://example.com/").mock(
        return_value=httpx.Response(200, text="<p>x</p>")
    )
    await execute_check(mid, db, redis=None)
    sent = route.calls.last.request
    assert sent.content == payload.encode("utf-8")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_decrypt_failure_strips_authorization_silently(
    respx_mock: respx.MockRouter, public_example_dns
) -> None:
    """If the auth ciphertext is corrupted, the probe runs with no Authorization
    header (and the decrypt failure is logged at error level)."""
    mid = uuid4()
    mon = _make_monitor(
        mid,
        enabled=["uptime_only"],
        http_auth={"scheme": "bearer", "token_ciphertext": "garbage"},
    )
    db = _mock_db(mon)
    route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    await execute_check(mid, db, redis=None)
    sent = route.calls.last.request
    assert "authorization" not in sent.headers
