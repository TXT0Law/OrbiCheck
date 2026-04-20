"""Unit tests for SSL-only monitor `execute_check` semantics (Bug 2).

Asserts that when the only enabled capability is `ssl_expiry`, the SSL probe
outcome drives `MonitorCheck.success`, `Monitor.consecutive_failures`, the
status state machine, and rolling stats — instead of being silently treated
as a successful HTTP probe.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import (
    CheckErrorType,
    Monitor,
    MonitorCheck,
    MonitorSnapshot,
    MonitorStatus,
)
from app.services import monitor_service
from app.services.monitor_service import execute_check
from app.services.ssl_probe import SslProbeResult

DEFAULT_FAILURE_THRESHOLD = 3


def _ssl_only_monitor(
    mid,
    *,
    consecutive_failures: int = 0,
    status: MonitorStatus = MonitorStatus.PENDING,
) -> Monitor:
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    return Monitor(
        id=mid,
        user_id=1,
        display_name="ssl-only",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=status,
        tags=[],
        consecutive_failures=consecutive_failures,
        total_checks=0,
        total_changes_detected=0,
    )


def _db_for_ssl_only(mon: Monitor, *, rolling_rows: list | None = None) -> AsyncMock:
    rows = rolling_rows or []
    added: list = []

    def add_side(o: object) -> None:
        added.append(o)

    async def flush_fn() -> None:
        for obj in added:
            if isinstance(obj, MonitorCheck) and obj.id is None:
                obj.id = uuid4()
            if isinstance(obj, MonitorSnapshot) and obj.id is None:
                obj.id = uuid4()

    async def execute_side_effect(stmt: object) -> MagicMock:
        result = MagicMock()
        result.scalars.return_value.all.return_value = rows
        result.scalar_one_or_none.return_value = None
        result.scalar.return_value = 0
        return result

    db = AsyncMock()
    db.get = AsyncMock(
        side_effect=lambda model, pk: mon if model is Monitor and pk == mon.id else None
    )
    db.add = MagicMock(side_effect=add_side)
    db.flush = AsyncMock(side_effect=flush_fn)
    db.delete = AsyncMock()
    db.execute = AsyncMock(side_effect=execute_side_effect)
    db.scalar = AsyncMock(return_value=True)
    db.refresh = AsyncMock()
    return db


def _ssl_success(days: int = 60) -> SslProbeResult:
    return SslProbeResult(
        success=True,
        hostname="example.com",
        port=443,
        probe_time_ms=12.0,
        days_remaining=days,
        is_valid=True,
        is_expired=False,
        subject_alternative_names=["example.com"],
        chain=[],
    )


def _ssl_failure(message: str = "bad cert") -> SslProbeResult:
    return SslProbeResult(
        success=False,
        hostname="example.com",
        port=443,
        probe_time_ms=8.0,
        days_remaining=None,
        is_valid=False,
        is_expired=False,
        error_type="HANDSHAKE",
        error_message=message,
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_only_success_marks_check_success() -> None:
    mid = uuid4()
    mon = _ssl_only_monitor(mid)
    db = _db_for_ssl_only(mon)

    with patch.object(monitor_service, "probe_ssl_async", AsyncMock(return_value=_ssl_success())):
        check = await execute_check(mid, db, redis=None)

    assert check is not None
    assert check.success is True
    assert mon.consecutive_failures == 0
    assert mon.status == MonitorStatus.UP


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_only_failure_increments_consecutive_failures() -> None:
    mid = uuid4()
    mon = _ssl_only_monitor(mid, consecutive_failures=0)
    db = _db_for_ssl_only(mon)

    with patch.object(
        monitor_service,
        "probe_ssl_async",
        AsyncMock(return_value=_ssl_failure()),
    ):
        check = await execute_check(mid, db, redis=None)

    assert check is not None
    assert check.success is False
    assert check.error_type == CheckErrorType.SSL_ERROR
    assert "bad cert" in (check.error_message or "")
    assert mon.consecutive_failures == 1
    assert mon.status == MonitorStatus.DEGRADED


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_only_repeated_failures_transition_to_down() -> None:
    """After threshold consecutive failures, status transitions to DOWN."""
    mid = uuid4()
    mon = _ssl_only_monitor(
        mid,
        consecutive_failures=DEFAULT_FAILURE_THRESHOLD - 1,
    )
    db = _db_for_ssl_only(mon)

    with patch.object(
        monitor_service,
        "probe_ssl_async",
        AsyncMock(return_value=_ssl_failure()),
    ):
        check = await execute_check(mid, db, redis=None)

    assert check is not None
    assert check.success is False
    assert mon.consecutive_failures == DEFAULT_FAILURE_THRESHOLD
    assert mon.status == MonitorStatus.DOWN


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_only_probe_exception_is_treated_as_failure() -> None:
    """When `probe_ssl_async` raises, ssl_result is None and check fails."""
    mid = uuid4()
    mon = _ssl_only_monitor(mid)
    db = _db_for_ssl_only(mon)

    with patch.object(
        monitor_service,
        "probe_ssl_async",
        AsyncMock(side_effect=Exception("socket")),
    ):
        check = await execute_check(mid, db, redis=None)

    assert check is not None
    assert check.success is False
    assert check.error_type == CheckErrorType.SSL_ERROR
    assert mon.consecutive_failures == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_only_does_not_overwrite_http_fields() -> None:
    """SSL-only mode must not smear stale HTTP status_code / response_time."""
    mid = uuid4()
    mon = _ssl_only_monitor(mid)
    mon.last_status_code = 200
    mon.last_response_time_ms = 123.4
    db = _db_for_ssl_only(mon)

    with patch.object(
        monitor_service,
        "probe_ssl_async",
        AsyncMock(return_value=_ssl_success()),
    ):
        await execute_check(mid, db, redis=None)

    assert mon.last_status_code == 200
    assert mon.last_response_time_ms == 123.4


@pytest.mark.asyncio
@pytest.mark.unit
async def test_mixed_uptime_and_ssl_does_not_use_ssl_only_mode() -> None:
    """Regression guard: mixed enabled set must not enter ssl_only_mode."""
    import socket

    import httpx
    import respx

    mid = uuid4()
    caps = capabilities_from_enabled_list(["uptime_only", "ssl_expiry"])
    mon = Monitor(
        id=mid,
        user_id=1,
        display_name="mixed",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["uptime_only", "ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.PENDING,
        tags=[],
        consecutive_failures=0,
        total_checks=0,
        total_changes_detected=0,
    )
    db = _db_for_ssl_only(mon)

    def _fake_dns(host: str, *_a, **_k):
        if host == "example.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        raise OSError("unexpected host")

    with patch("socket.getaddrinfo", side_effect=_fake_dns):
        with patch.object(
            monitor_service,
            "probe_ssl_async",
            AsyncMock(return_value=_ssl_success()),
        ):
            with respx.mock(assert_all_called=False) as router:
                router.route(host="example.com", port=443).mock(
                    return_value=httpx.Response(200, text="ok")
                )
                check = await execute_check(mid, db, redis=None)

    assert check is not None
    assert check.success is True
    assert mon.last_status_code == 200
    assert mon.consecutive_failures == 0
