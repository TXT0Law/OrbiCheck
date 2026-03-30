"""Batch unit tests for monitor_service helpers and CRUD-style paths (mocked DB)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorCreateRequest, MonitorUpdateRequest
from app.core.monitor_defaults import capabilities_from_enabled_list
from app.core.exceptions import AppException, NotFoundError, ValidationError
from app.models.monitor import CheckErrorType, Monitor, MonitorStatus
from app.services import monitor_service


def _mon(mid=None, **kwargs):
    mid = mid or uuid4()
    caps = capabilities_from_enabled_list(["uptime_only"])
    now = datetime.now(timezone.utc)
    return Monitor(
        id=mid,
        user_id=1,
        display_name=kwargs.get("display_name", "t"),
        url=kwargs.get("url", "https://example.com"),
        capabilities=caps,
        enabled_capabilities=["uptime_only"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=kwargs.get("is_enabled", True),
        status=kwargs.get("status", MonitorStatus.UP),
        tags=[],
        total_checks=kwargs.get("total_checks", 0),
        consecutive_failures=kwargs.get("consecutive_failures", 0),
        created_at=kwargs.get("created_at", now),
        updated_at=kwargs.get("updated_at", now),
    )


@pytest.mark.unit
def test_error_type_to_api_label_all() -> None:
    for et in CheckErrorType:
        assert monitor_service._error_type_to_api_label(et) is not None
    assert monitor_service._error_type_to_api_label(None) is None


@pytest.mark.unit
def test_normalize_capability_tokens() -> None:
    assert "uptime_only" in monitor_service._normalize_capability_tokens(
        ["UPTIME_ONLY", "content_change"]
    )


@pytest.mark.unit
def test_count_incidents_edges() -> None:
    assert monitor_service._count_incidents_from_successes([False, False, True]) == 1
    assert monitor_service._count_incidents_from_successes([True, False, True, False]) == 2


@pytest.mark.unit
def test_p95_empty_and_single() -> None:
    assert monitor_service._p95([]) == 0.0
    assert monitor_service._p95([10.0]) == 10.0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_list_monitors_invalid_status_ignored() -> None:
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=0)
    db.execute = AsyncMock(
        return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))
    )
    rows, meta = await monitor_service.list_monitors(1, "not_a_real_status", None, 1, 20, db)
    assert meta["total"] == 0
    assert rows == []


@pytest.mark.asyncio
@pytest.mark.unit
async def test_create_monitor_limit(monkeypatch) -> None:
    monkeypatch.setattr(monitor_service, "_count_user_monitors", AsyncMock(return_value=999))
    monkeypatch.setattr(monitor_service.settings, "MAX_MONITORS_PER_USER", 1)
    db = AsyncMock()
    req = MonitorCreateRequest(
        display_name="a",
        url="https://example.com",
        enabled_capabilities=["uptime_only"],
    )
    with pytest.raises(ValidationError) as ei:
        await monitor_service.create_monitor(1, req, db)
    assert ei.value.code == "MONITOR_LIMIT"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_monitor_not_found() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(NotFoundError):
        await monitor_service.delete_monitor(uuid4(), 1, db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_trigger_manual_check_cooldown() -> None:
    mid = uuid4()
    m = _mon(mid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=1)
    with pytest.raises(AppException) as ei:
        await monitor_service.trigger_manual_check(mid, 1, db, redis)
    assert ei.value.status_code == 429


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_change_diff_not_found_monitor() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(NotFoundError):
        await monitor_service.get_change_diff(uuid4(), uuid4(), 1, db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_baseline_no_rows() -> None:
    mid = uuid4()
    m = _mon(mid)
    m.enabled_capabilities = ["content_change"]
    caps = capabilities_from_enabled_list(["content_change"])
    m.capabilities = caps
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)

    async def ex(stmt):
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        return r

    db.execute = AsyncMock(side_effect=ex)
    out = await monitor_service.get_baseline_snapshot(mid, 1, db)
    assert out is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_snapshot_raw_wrong_monitor() -> None:
    from app.models.monitor import MonitorSnapshot

    mid = uuid4()
    m = _mon(mid)
    db = AsyncMock()

    def _get(model, pk):
        if model is Monitor:
            return m
        if model is MonitorSnapshot:
            return None
        return None

    db.get = AsyncMock(side_effect=_get)
    from app.core.exceptions import SnapshotNotFoundException

    with pytest.raises(SnapshotNotFoundException):
        await monitor_service.get_snapshot_raw_for_owner(mid, uuid4(), 1, db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_monitor_url_blocked() -> None:
    mid = uuid4()
    m = _mon(mid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    req = MonitorUpdateRequest(url="http://127.0.0.1/nope")
    with pytest.raises(ValidationError):
        await monitor_service.update_monitor(mid, 1, req, db)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_monitor_non_dict_capabilities_jsonb_no_500() -> None:
    """Legacy/corrupt JSONB must not raise TypeError when merging alert/thresholds."""
    mid = uuid4()
    m = _mon(mid)
    m.capabilities = {
        "uptime_only": {"alert": [], "thresholds": "bad"},
        "content_change": True,
    }
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    req = MonitorUpdateRequest(
        display_name="lll",
        enabled_capabilities=["uptime_only", "content_change", "ssl_expiry"],
    )
    row = await monitor_service.update_monitor(mid, 1, req, db)
    assert row.display_name == "lll"
    assert isinstance(m.capabilities, dict)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_pause_resume_roundtrip() -> None:
    mid = uuid4()
    m = _mon(mid)
    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    r = await monitor_service.pause_monitor(mid, 1, db)
    assert r.status == "paused"
    m2 = _mon(mid, is_enabled=False, status=MonitorStatus.PAUSED)
    db.get = AsyncMock(return_value=m2)
    r2 = await monitor_service.resume_monitor(mid, 1, db)
    assert r2.status != "paused"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_stream_monitor_channel_yields_heartbeat(monkeypatch) -> None:
    monkeypatch.setattr(
        monitor_service.settings,
        "MONITOR_SSE_HEARTBEAT_SECONDS",
        0.05,
    )
    ps = AsyncMock()
    ps.subscribe = AsyncMock()
    ps.get_message = AsyncMock(return_value=None)
    ps.unsubscribe = AsyncMock()
    ps.close = AsyncMock()
    ps.aclose = AsyncMock()
    redis = MagicMock()
    redis.pubsub = MagicMock(return_value=ps)

    gen = monitor_service.stream_monitor_channel(uuid4(), redis)
    found = False
    try:
        async for chunk in gen:
            if b"heartbeat" in chunk:
                found = True
                break
    finally:
        await gen.aclose()
    assert found


@pytest.mark.asyncio
@pytest.mark.unit
async def test_stream_user_monitors_live_yields_client_message(monkeypatch) -> None:
    monkeypatch.setattr(
        monitor_service.settings,
        "MONITOR_SSE_HEARTBEAT_SECONDS",
        3600,
    )
    msg_payload = (
        '{"event": "check_completed", "monitorId": "550e8400-e29b-41d4-a716-446655440000", '
        '"data": {"success": true}}'
    )

    async def fake_get_message(*_a, **_kw):
        fake_get_message.calls += 1
        if fake_get_message.calls == 1:
            return {"type": "message", "data": msg_payload}
        return None

    fake_get_message.calls = 0

    ps = AsyncMock()
    ps.subscribe = AsyncMock()
    ps.get_message = fake_get_message
    ps.unsubscribe = AsyncMock()
    ps.close = AsyncMock()
    ps.aclose = AsyncMock()
    redis = MagicMock()
    redis.pubsub = MagicMock(return_value=ps)

    gen = monitor_service.stream_user_monitors_live(42, redis)
    chunk = await gen.__anext__()
    await gen.aclose()
    assert b"550e8400-e29b-41d4-a716-446655440000" in chunk
    assert b"check_completed" in chunk
