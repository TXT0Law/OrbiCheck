"""Unit tests for execute_check with mocked DB and HTTP (respx)."""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
import respx

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorStatus
from app.services.monitor_service import execute_check


def _make_monitor(mid, url: str = "https://example.com") -> Monitor:
    return Monitor(
        id=mid,
        user_id=1,
        display_name="t",
        url=url,
        capabilities=capabilities_from_enabled_list(["uptime_only"]),
        enabled_capabilities=["uptime_only"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.PENDING,
        tags=[],
    )


def _mock_db(mon: Monitor) -> AsyncMock:
    db = AsyncMock()
    db.get = AsyncMock(return_value=mon)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.delete = AsyncMock()
    db.refresh = AsyncMock()
    er = MagicMock()
    er.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=er)
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
async def test_execute_check_aborts_when_paused_mid_flight(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """Pause committed while HTTP probe runs: refresh sees is_enabled False and drops check."""
    mid = uuid4()
    mon = _make_monitor(mid)
    respx_mock.route(host="example.com", port=443).mock(
        return_value=httpx.Response(200, text="ok")
    )

    db = _mock_db(mon)
    db.scalar = AsyncMock(return_value=False)

    result = await execute_check(mid, db, redis=None)
    assert result is None
    db.delete.assert_awaited()
    db.flush.assert_awaited()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_execute_check_uptime_get_success(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _make_monitor(mid)
    respx_mock.route(host="example.com", port=443).mock(
        return_value=httpx.Response(200, text="ok")
    )

    db = _mock_db(mon)
    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert check.success is True
    assert check.status_code == 200
    assert mon.status == MonitorStatus.UP
    assert mon.consecutive_failures == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_execute_check_timeout(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _make_monitor(mid)

    respx_mock.route(host="example.com", port=443).mock(
        side_effect=httpx.TimeoutException("timeout"),
    )

    db = _mock_db(mon)
    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert check.success is False
    assert check.error_type is not None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_execute_check_blocked_url_no_http() -> None:
    mid = uuid4()
    mon = _make_monitor(mid, url="http://127.0.0.1/x")

    db = _mock_db(mon)
    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert check.success is False
    assert "127.0.0.1" in (check.error_message or "")
