"""Unit tests for Phase 2.3 CT log probe."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorCtEntry, MonitorStatus
from app.services import ct_log_service


def _monitor_with_ct(*, enabled: bool = True, pinned: list[str] | None = None) -> Monitor:
    caps = capabilities_from_enabled_list(["uptime_only", "ct_log"])
    caps["ct_log"]["enabled"] = enabled
    caps["ct_log"]["thresholds"] = {
        "pinnedSerials": pinned or [],
        "lookbackHours": 24,
        "alertOnNewEntry": True,
    }
    return Monitor(
        id=uuid.uuid4(),
        user_id=1,
        display_name="ct",
        url="https://example.com/path",
        capabilities=caps,
        enabled_capabilities=["uptime_only", "ct_log"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )


def _make_db(
    existing: list[MonitorCtEntry],
    *,
    last_observed: datetime | None = None,
) -> tuple[AsyncMock, list]:
    """Build an AsyncSession mock that satisfies probe_ct_log's two queries.

    probe_ct_log calls ``db.execute`` twice per invocation:
      1. ``select(func.max(observed_at))`` -> consumed via ``.scalar_one_or_none()``
      2. ``select(MonitorCtEntry)`` -> consumed via ``.scalars().all()``
    Returning a single result object that supports both methods keeps the
    test setup straightforward while staying faithful to the real API surface.
    """

    added: list = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=added.append)
    scalars = SimpleNamespace(all=lambda: existing)
    result = SimpleNamespace(
        scalars=lambda: scalars,
        scalar_one_or_none=lambda: last_observed,
    )
    db.execute = AsyncMock(return_value=result)
    return db, added


@pytest.mark.unit
def test_normalize_serial_strips_colons_and_lowercases() -> None:
    assert ct_log_service._normalize_serial("AB:cd:01") == "abcd01"


@pytest.mark.unit
def test_parse_crtsh_datetime_handles_microseconds() -> None:
    parsed = ct_log_service._parse_crtsh_datetime("2026-04-21T12:00:00.123456")
    assert parsed is not None and parsed.tzinfo is timezone.utc
    assert ct_log_service._parse_crtsh_datetime(None) is None
    assert ct_log_service._parse_crtsh_datetime("nonsense") is None


@pytest.mark.unit
def test_normalize_pin_set_lowercases_and_strips() -> None:
    pins = ct_log_service._normalize_pin_set(
        {"pinnedSerials": ["AA:BB", " cc:dd "]}
    )
    assert pins == {"aabb", "ccdd"}
    snake = ct_log_service._normalize_pin_set(
        {"pinned_serials": ["EE:FF"]}
    )
    assert snake == {"eeff"}


@pytest.mark.unit
def test_lookback_window_clamps_bounds() -> None:
    assert ct_log_service._ct_lookback_window({}) == timedelta(hours=24)
    # Zero / falsy is treated as "missing" → defaults to 24h.
    assert ct_log_service._ct_lookback_window(
        {"lookbackHours": 0}
    ) == timedelta(hours=24)
    # Above the upper bound is clamped to the documented max (720h).
    assert ct_log_service._ct_lookback_window(
        {"lookback_hours": 1000}
    ) == timedelta(hours=720)
    # Below the lower bound is clamped up to 1h.
    assert ct_log_service._ct_lookback_window(
        {"lookback_hours": -5}
    ) == timedelta(hours=1)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_fetch_ct_entries_handles_non_200() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(503, json={"err": "down"})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        rows = await ct_log_service.fetch_ct_entries("example.com", client=client)
    assert rows == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_fetch_ct_entries_parses_payload() -> None:
    payload = [
        {
            "serial_number": "ab:cd",
            "issuer_name": "Let's Encrypt",
            "common_name": "example.com",
            "not_before": "2026-04-01T00:00:00",
            "not_after": "2026-07-01T00:00:00",
            "id": 12345,
        },
        {"missing_serial": True},
    ]
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload)
    )
    async with httpx.AsyncClient(transport=transport) as client:
        rows = await ct_log_service.fetch_ct_entries("example.com", client=client)
    assert len(rows) == 1
    assert rows[0].serial_number == "abcd"
    assert rows[0].crtsh_id == "12345"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_returns_empty_when_capability_disabled() -> None:
    monitor = _monitor_with_ct(enabled=False)
    db, _ = _make_db([])
    result = await ct_log_service.probe_ct_log(monitor, db)
    assert result.new_entries == [] and result.pin_violations == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_inserts_new_entries_and_flags_pin_violation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Pin a hex serial so the value passes the API-layer schema regex too.
    monitor = _monitor_with_ct(pinned=["deadbeef"])
    existing = MonitorCtEntry(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        hostname="example.com",
        serial_number="alreadyseen",
    )
    # last_observed must be older than the lookback window or the cooldown
    # rate-limiter (added in the same fix) will short-circuit the probe.
    stale = datetime.now(timezone.utc) - timedelta(hours=48)
    db, added = _make_db([existing], last_observed=stale)

    now = datetime.now(timezone.utc)
    fake_entries = [
        ct_log_service.CtEntryRecord(
            serial_number="alreadyseen",
            issuer_name=None,
            common_name=None,
            not_before=now,
            not_after=None,
            crtsh_id=None,
        ),
        ct_log_service.CtEntryRecord(
            serial_number="newserial",
            issuer_name="Test CA",
            common_name="example.com",
            not_before=now,
            not_after=None,
            crtsh_id="42",
        ),
        ct_log_service.CtEntryRecord(
            serial_number="staleentry",
            issuer_name="Test CA",
            common_name="example.com",
            not_before=now - timedelta(hours=72),  # outside 24h lookback
            not_after=None,
            crtsh_id="43",
        ),
    ]

    async def _fake_fetch(*_args, **_kwargs):
        return fake_entries

    monkeypatch.setattr(ct_log_service, "fetch_ct_entries", _fake_fetch)
    result = await ct_log_service.probe_ct_log(monitor, db)

    serials = {row.serial_number for row in added if isinstance(row, MonitorCtEntry)}
    assert serials == {"newserial"}
    assert [r.serial_number for r in result.new_entries] == ["newserial"]
    assert [r.serial_number for r in result.pin_violations] == ["newserial"]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_skips_fetch_when_within_cooldown_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """probe_ct_log must NOT hit crt.sh while inside the lookback cooldown.

    Mirrors the rate-limit guarantee documented in the module docstring;
    without this guard, a monitor with interval_seconds=5 would hammer
    crt.sh ~17k times/day per host.
    """

    monitor = _monitor_with_ct()
    fresh = datetime.now(timezone.utc) - timedelta(hours=1)
    db, added = _make_db([], last_observed=fresh)

    fetch_calls: list[str] = []

    async def _fake_fetch(hostname: str, **_kwargs):
        fetch_calls.append(hostname)
        return []

    monkeypatch.setattr(ct_log_service, "fetch_ct_entries", _fake_fetch)
    result = await ct_log_service.probe_ct_log(monitor, db)

    assert fetch_calls == []
    assert result.new_entries == []
    assert added == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_first_run_with_no_history_polls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the monitor has zero stored entries the cooldown must NOT engage."""

    monitor = _monitor_with_ct()
    db, _ = _make_db([], last_observed=None)

    fetch_calls: list[str] = []

    async def _fake_fetch(hostname: str, **_kwargs):
        fetch_calls.append(hostname)
        return []

    monkeypatch.setattr(ct_log_service, "fetch_ct_entries", _fake_fetch)
    await ct_log_service.probe_ct_log(monitor, db)
    assert fetch_calls == ["example.com"]
