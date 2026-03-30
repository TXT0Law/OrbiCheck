"""Deep coverage tests for monitor_service (capability cards, CRUD success, diff, SSL)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorCreateRequest, MonitorUpdateRequest
from app.core.monitor_defaults import CAPABILITY_KEYS, capabilities_from_enabled_list
from app.models.monitor import (
    Monitor,
    MonitorChange,
    MonitorCheck,
    MonitorSnapshot,
    MonitorStatus,
)
from app.core.exceptions import ChangeNotFoundException
from app.services import monitor_service
from app.services.ssl_probe import SslProbeResult


def _full_mon(mid, **kwargs) -> Monitor:
    now = datetime.now(timezone.utc)
    caps = kwargs.get("capabilities") or capabilities_from_enabled_list(
        kwargs.get("enabled", ["uptime_only"])
    )
    en = kwargs.get("enabled", ["uptime_only"])
    return Monitor(
        id=mid,
        user_id=1,
        display_name="x",
        url=kwargs.get("url", "https://example.com"),
        capabilities=caps,
        enabled_capabilities=en,
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=kwargs.get("status", MonitorStatus.UP),
        tags=[],
        total_checks=kwargs.get("total_checks", 1),
        consecutive_failures=kwargs.get("consecutive_failures", 0),
        uptime_percentage=kwargs.get("uptime_percentage", 99.0),
        ssl_expiry_days=kwargs.get("ssl_expiry_days"),
        last_change_detected_at=kwargs.get("last_change_detected_at"),
        total_changes_detected=kwargs.get("total_changes_detected", 0),
        created_at=now,
        updated_at=now,
    )


@pytest.mark.parametrize("sole_cap", list(CAPABILITY_KEYS))
@pytest.mark.unit
def test_compute_capability_statuses_each_enabled(sole_cap: str) -> None:
    caps = capabilities_from_enabled_list([sole_cap])
    m = _full_mon(uuid4(), enabled=[sole_cap], capabilities=caps)
    en, cn = monitor_service._capabilities_for_api(m)
    rows = monitor_service._compute_capability_statuses(m, en, cn, None)
    assert len(rows) == len(CAPABILITY_KEYS)
    active = [r for r in rows if r.capability == sole_cap][0]
    assert active.status != "disabled"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_create_monitor_success(monkeypatch) -> None:
    monkeypatch.setattr(monitor_service, "_count_user_monitors", AsyncMock(return_value=0))
    db = AsyncMock()
    db.add = MagicMock()

    async def _flush() -> None:
        for call in db.add.call_args_list:
            o = call[0][0]
            if isinstance(o, Monitor):
                if o.id is None:
                    o.id = uuid4()
                now = datetime.now(timezone.utc)
                if o.created_at is None:
                    o.created_at = now
                if o.updated_at is None:
                    o.updated_at = now
                if o.is_enabled is None:
                    o.is_enabled = True
                if o.total_checks is None:
                    o.total_checks = 0
                if o.consecutive_failures is None:
                    o.consecutive_failures = 0

    db.flush = AsyncMock(side_effect=_flush)
    req = MonitorCreateRequest(
        display_name="n",
        url="https://example.com",
        enabled_capabilities=["uptime_only"],
    )
    row = await monitor_service.create_monitor(1, req, db)
    assert row.display_name == "n"
    db.add.assert_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_monitor_merge_capabilities() -> None:
    mid = uuid4()
    m = _full_mon(mid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    req = MonitorUpdateRequest(
        display_name="z",
        capabilities={"uptime_only": {"thresholds": {"maxResponseTimeMs": 9999}}},
    )
    row = await monitor_service.update_monitor(mid, 1, req, db)
    assert row.display_name == "z"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_monitor_loads_content_extra(monkeypatch) -> None:
    mid = uuid4()
    m = _full_mon(mid, enabled=["content_change"])
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    monkeypatch.setattr(
        monitor_service,
        "_fetch_content_capability_extra",
        AsyncMock(return_value={"changes_7d": 2, "baseline_age_days": 3}),
    )
    row = await monitor_service.get_monitor(mid, 1, db)
    assert any(s.capability == "content_change" for s in row.capability_statuses)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_change_diff_success_path() -> None:
    mid = uuid4()
    cid = uuid4()
    sid1, sid2 = uuid4(), uuid4()
    m = _full_mon(mid)
    prev = MonitorSnapshot(
        id=sid1,
        monitor_id=mid,
        check_id=uuid4(),
        content_hash="a" * 64,
        content_size_bytes=2,
        content="aa",
        captured_at=datetime.now(timezone.utc),
    )
    cur = MonitorSnapshot(
        id=sid2,
        monitor_id=mid,
        check_id=uuid4(),
        content_hash="b" * 64,
        content_size_bytes=2,
        content="bb",
        captured_at=datetime.now(timezone.utc),
    )
    ch = MonitorChange(
        id=cid,
        monitor_id=mid,
        previous_snapshot_id=sid1,
        current_snapshot_id=sid2,
        diff_summary={
            "linesAdded": 1,
            "linesRemoved": 1,
            "linesChanged": 1,
            "totalDiffLines": 2,
            "changeCategory": "small",
        },
    )

    async def getter(model, pk):
        if model is Monitor and pk == mid:
            return m
        if model is MonitorChange and pk == cid:
            return ch
        if model is MonitorSnapshot and pk == sid1:
            return prev
        if model is MonitorSnapshot and pk == sid2:
            return cur
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=getter)
    diff = await monitor_service.get_change_diff(mid, cid, 1, db)
    assert diff.change_id == str(cid)
    assert "aa" in diff.previous_content


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_ssl_status_expired() -> None:
    mid = uuid4()
    m = _full_mon(mid, url="https://example.com", enabled=["ssl_expiry"])
    chk = MonitorCheck(
        id=uuid4(),
        monitor_id=mid,
        success=True,
        response_time_ms=0.0,
        content_changed=False,
        evaluated_capabilities=["ssl_expiry"],
        ssl_snapshot={
            "success": True,
            "days_remaining": -1,
            "is_expired": True,
            "is_valid": False,
            "not_before": "2020-01-01T00:00:00+00:00",
            "not_after": "2021-01-01T00:00:00+00:00",
            "subject_dn": "CN=x",
            "issuer_dn": "CN=y",
            "chain": [],
            "subject_alternative_names": [],
        },
    )
    chk.checked_at = datetime.now(timezone.utc)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=chk))
    )
    r = await monitor_service.get_ssl_status(mid, 1, db)
    assert r.severity_level == "critical"
    assert r.is_expired is True


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_ssl_status_warn() -> None:
    mid = uuid4()
    m = _full_mon(mid, url="https://example.com", enabled=["ssl_expiry"])
    chk = MonitorCheck(
        id=uuid4(),
        monitor_id=mid,
        success=True,
        response_time_ms=0.0,
        content_changed=False,
        evaluated_capabilities=["ssl_expiry"],
        ssl_snapshot={
            "success": True,
            "days_remaining": 20,
            "is_expired": False,
            "is_valid": True,
            "not_before": "2025-01-01T00:00:00+00:00",
            "not_after": "2027-01-01T00:00:00+00:00",
            "subject_dn": "CN=x",
            "issuer_dn": "CN=y",
            "chain": [],
            "subject_alternative_names": ["example.com"],
        },
    )
    chk.checked_at = datetime.now(timezone.utc)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=chk))
    )
    r = await monitor_service.get_ssl_status(mid, 1, db)
    assert r.severity_level in ("warning", "ok", "critical")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_stream_monitor_channel_message(monkeypatch) -> None:
    monkeypatch.setattr(monitor_service.settings, "MONITOR_SSE_HEARTBEAT_SECONDS", 600.0)
    payload = '{"event": "check_completed", "data": {"x": 1}}'
    msg = {"type": "message", "data": payload.encode()}
    ps = AsyncMock()
    ps.subscribe = AsyncMock()
    ps.get_message = AsyncMock(side_effect=[msg, None])
    ps.unsubscribe = AsyncMock()
    ps.close = AsyncMock()
    ps.aclose = AsyncMock()
    redis = MagicMock()
    redis.pubsub = MagicMock(return_value=ps)
    gen = monitor_service.stream_monitor_channel(uuid4(), redis)
    chunk = await gen.__anext__()
    assert b"check_completed" in chunk
    await gen.aclose()


@pytest.mark.unit
def test_is_https_and_extract_host_port_http() -> None:
    from app.services.ssl_probe import extract_host_port

    assert monitor_service._is_https("http://example.com") is False
    h, p = extract_host_port("http://example.com/path")
    assert h == "example.com"
    assert p == 80


@pytest.mark.asyncio
@pytest.mark.unit
async def test_list_monitors_with_search_and_valid_status() -> None:
    mid = uuid4()
    m = _full_mon(mid, enabled=["uptime_only"])
    m.display_name = "hello"
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=1)
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[m])))
        )
    )
    rows, meta = await monitor_service.list_monitors(1, "up", "hell", 1, 20, db)
    assert meta["total"] == 1
    assert len(rows) == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_monitor_enabled_capabilities_rebuilds() -> None:
    mid = uuid4()
    m = _full_mon(mid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    req = MonitorUpdateRequest(
        enabled_capabilities=["ssl_expiry", "uptime_only"],
    )
    row = await monitor_service.update_monitor(mid, 1, req, db)
    assert "ssl_expiry" in row.enabled_capabilities


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_change_diff_wrong_monitor_id() -> None:
    mid = uuid4()
    other = uuid4()
    m = _full_mon(mid)
    ch = MonitorChange(
        id=uuid4(),
        monitor_id=other,
        previous_snapshot_id=uuid4(),
        current_snapshot_id=uuid4(),
        diff_summary={"linesAdded": 0, "linesRemoved": 0, "linesChanged": 0},
    )

    async def getter(model, pk):
        if model is Monitor:
            return m
        if model is MonitorChange:
            return ch
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=getter)
    with pytest.raises(ChangeNotFoundException):
        await monitor_service.get_change_diff(mid, ch.id, 1, db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_monitor_success() -> None:
    mid = uuid4()
    m = _full_mon(mid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.delete = AsyncMock()
    await monitor_service.delete_monitor(mid, 1, db)
    db.delete.assert_awaited_once_with(m)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("days", "expect"),
    [
        (15, MonitorStatus.DEGRADED),
        (3, MonitorStatus.DEGRADED),
        (-2, MonitorStatus.DOWN),
    ],
)
@pytest.mark.unit
async def test_execute_check_ssl_only_status_by_days(
    days: int,
    expect: MonitorStatus,
    monkeypatch,
) -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    m = Monitor(
        id=mid,
        user_id=1,
        display_name="s",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
        total_checks=0,
        consecutive_failures=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        )
    )

    async def _fake_probe(*_a, **_kw):
        return SslProbeResult(
            success=True,
            hostname="example.com",
            port=443,
            probe_time_ms=1.0,
            days_remaining=days,
            not_before="2020-01-01T00:00:00+00:00",
            not_after="2030-01-01T00:00:00+00:00",
            subject_dn="CN=example.com",
            issuer_dn="CN=ca",
            serial_number="1",
            signature_algorithm="sha256",
            sha256_fingerprint="AA:BB",
            is_valid=days >= 0,
            is_expired=days < 0,
            subject_alternative_names=[],
            chain=[],
        )

    monkeypatch.setattr(monitor_service, "probe_ssl_async", _fake_probe)
    await monitor_service.execute_check(mid, db, redis=None)
    assert m.status == expect


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_checks_with_period() -> None:
    mid = uuid4()
    m = _full_mon(mid)
    chk = MonitorCheck(
        id=uuid4(),
        monitor_id=mid,
        success=True,
        response_time_ms=1.0,
        content_changed=False,
        evaluated_capabilities=[],
    )
    chk.checked_at = datetime.now(timezone.utc)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.scalar = AsyncMock(return_value=1)
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[chk])))
        )
    )
    rows, meta = await monitor_service.get_checks(mid, 1, 1, 50, db, period="24h")
    assert meta["total"] == 1
    assert len(rows) == 1
