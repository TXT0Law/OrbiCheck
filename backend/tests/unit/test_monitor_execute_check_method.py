"""Unit tests for HTTP method handling in `execute_check` (Bug 3).

Asserts:
- `content_change` no longer silently overrides `monitor.http_method`.
- `content_change + http_method=HEAD` fails fast (HEAD has no body to hash).
- `content_change + http_method=POST` issues a POST (with empty body until the
  P1 follow-up that adds `Monitor.http_body`).
- `content_change + http_method=GET` happy path keeps working.
- `uptime_only + http_method=POST` keeps existing streaming POST behavior.
"""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
import respx

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import (
    CheckErrorType,
    Monitor,
    MonitorChange,
    MonitorCheck,
    MonitorSnapshot,
    MonitorStatus,
)
from app.services.monitor_service import execute_check


def _make_monitor(
    mid,
    *,
    enabled: list[str],
    http_method: str = "GET",
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
        st = str(stmt).lower()
        r = MagicMock()
        if "osint_monitor_snapshots" in st:
            r.scalar_one_or_none.return_value = None
        if "osint_monitor_changes" in st and "count" in st:
            r.scalar.return_value = 0
        r.scalars.return_value.all.return_value = []
        r.scalar_one_or_none.return_value = None
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


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_change_post_uses_configured_method(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """POST + content_change must issue a POST (no longer silently GET)."""
    mid = uuid4()
    mon = _make_monitor(mid, enabled=["content_change"], http_method="POST")
    db = _mock_db(mon)

    post_route = respx_mock.post("https://example.com/").mock(
        return_value=httpx.Response(200, text="<p>ok</p>")
    )
    get_route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text="should-not-be-used")
    )

    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert post_route.called
    assert not get_route.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_change_head_short_circuits(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """HEAD + content_change is incompatible — fail fast, no HTTP call."""
    mid = uuid4()
    mon = _make_monitor(mid, enabled=["content_change"], http_method="HEAD")
    db = _mock_db(mon)

    head_route = respx_mock.head("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    get_route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200)
    )

    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert check.success is False
    assert check.error_type == CheckErrorType.UNKNOWN
    assert "HEAD" in (check.error_message or "")
    assert not head_route.called
    assert not get_route.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_change_get_happy_path(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _make_monitor(mid, enabled=["content_change"], http_method="GET")
    db = _mock_db(mon)

    route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text="<p>x</p>")
    )

    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert check.success is True
    assert route.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_uptime_only_post_uses_streaming_post(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """Pre-existing behavior: uptime_only POST goes through client.stream."""
    mid = uuid4()
    mon = _make_monitor(mid, enabled=["uptime_only"], http_method="POST")
    db = _mock_db(mon)

    post_route = respx_mock.post("https://example.com/").mock(
        return_value=httpx.Response(200)
    )

    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert post_route.called
    assert check.success is True
