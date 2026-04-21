"""Unit tests for Phase 2.2 DNS change probe."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorDnsRecord, MonitorStatus
from app.services import dns_monitor_service


def _monitor_with_dns(*, enabled: bool = True) -> Monitor:
    caps = capabilities_from_enabled_list(["uptime_only", "dns_change"])
    caps["dns_change"]["enabled"] = enabled
    caps["dns_change"]["thresholds"] = {
        "recordTypes": ["A", "AAAA"],
        "nameservers": [],
        "queryTimeoutSeconds": 5,
        "alertOnChange": True,
    }
    return Monitor(
        id=uuid.uuid4(),
        user_id=1,
        display_name="dns",
        url="https://example.com/path",
        capabilities=caps,
        enabled_capabilities=["uptime_only", "dns_change"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )


def _make_db(snapshots: list[MonitorDnsRecord]) -> tuple[AsyncMock, list]:
    added: list = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=added.append)
    scalars = SimpleNamespace(all=lambda: snapshots)
    db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: scalars))
    return db, added


@pytest.mark.unit
def test_hostname_from_url_handles_path_and_port() -> None:
    assert dns_monitor_service._hostname_from_url(
        "https://Example.com:8443/path"
    ) == "example.com"


@pytest.mark.unit
def test_hostname_from_url_returns_none_for_invalid() -> None:
    assert dns_monitor_service._hostname_from_url("not-a-url") is None


@pytest.mark.unit
def test_normalize_values_dedupes_sorts_and_strips_dots() -> None:
    assert dns_monitor_service._normalize_values(
        ["1.1.1.1", "1.1.1.1", "9.9.9.9.", "8.8.8.8"]
    ) == ["1.1.1.1", "8.8.8.8", "9.9.9.9"]


@pytest.mark.unit
def test_resolver_record_types_falls_back_to_default() -> None:
    assert dns_monitor_service._resolver_record_types({}) == list(
        dns_monitor_service.DEFAULT_DNS_RECORD_TYPES
    )
    assert dns_monitor_service._resolver_record_types(
        {"recordTypes": ["a", "aaaa", "BOGUS"]}
    ) == ["A", "AAAA"]


@pytest.mark.unit
def test_query_timeout_clamps_to_minimum() -> None:
    assert dns_monitor_service._query_timeout({"queryTimeoutSeconds": 0.1}) == 1.0
    assert dns_monitor_service._query_timeout({}) == 5.0
    assert dns_monitor_service._query_timeout({"query_timeout_seconds": 12}) == 12.0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_returns_empty_when_capability_disabled() -> None:
    monitor = _monitor_with_dns(enabled=False)
    db, _ = _make_db([])
    diffs = await dns_monitor_service.probe_dns_changes(monitor, db)
    assert diffs == []
    db.execute.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_persists_first_seen_without_emitting_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_dns()
    db, added = _make_db([])

    async def _fake_resolve(*_args, **_kwargs):
        return {"A": ["1.1.1.1"], "AAAA": ["::1"]}

    monkeypatch.setattr(dns_monitor_service, "resolve_records", _fake_resolve)
    diffs = await dns_monitor_service.probe_dns_changes(monitor, db)

    assert diffs == []  # first observation is never reported as a change
    assert len([row for row in added if isinstance(row, MonitorDnsRecord)]) == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_emits_change_when_record_set_differs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_dns()
    existing = MonitorDnsRecord(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        record_type="A",
        values=["1.1.1.1"],
    )
    db, added = _make_db([existing])

    async def _fake_resolve(*_args, **_kwargs):
        return {"A": ["1.1.1.1", "2.2.2.2"], "AAAA": []}

    monkeypatch.setattr(dns_monitor_service, "resolve_records", _fake_resolve)
    diffs = await dns_monitor_service.probe_dns_changes(monitor, db)

    assert [d.record_type for d in diffs] == ["A"]
    assert diffs[0].added == ["2.2.2.2"]
    assert diffs[0].removed == []
    # An AAAA snapshot row was inserted (first-seen, empty).
    assert any(
        isinstance(r, MonitorDnsRecord) and r.record_type == "AAAA" for r in added
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_probe_skips_record_when_resolver_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_dns()
    db, added = _make_db([])

    async def _fake_resolve(*_args, **_kwargs):
        return {"A": None, "AAAA": ["::1"]}  # transient failure on A

    monkeypatch.setattr(dns_monitor_service, "resolve_records", _fake_resolve)
    diffs = await dns_monitor_service.probe_dns_changes(monitor, db)

    assert diffs == []
    persisted_types = {
        r.record_type for r in added if isinstance(r, MonitorDnsRecord)
    }
    # Only AAAA should have been persisted; A was skipped due to transient failure.
    assert persisted_types == {"AAAA"}
