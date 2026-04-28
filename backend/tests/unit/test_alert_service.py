"""Unit tests for alert policy evaluation and dispatch."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor, MonitorStatus
from app.services import alert_service


def _monitor_with_alerts(
    capability: str = "uptime_only",
    *,
    enabled: bool = True,
    cooldown_seconds: int = 0,
    quiet_hours: dict | None = None,
) -> Monitor:
    caps = capabilities_from_enabled_list([capability])
    caps[capability]["alert"] = {
        "enabled": enabled,
        "cooldownSeconds": cooldown_seconds,
        "quietHours": quiet_hours,
    }
    return Monitor(
        id=uuid4(),
        user_id=1,
        display_name="Monitor",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=[capability],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )


def _db() -> tuple[AsyncMock, list[AlertEvent]]:
    added: list[AlertEvent] = []

    def add_side_effect(obj: object) -> None:
        if isinstance(obj, AlertEvent) and obj.id is None:
            obj.id = uuid4()
        if isinstance(obj, AlertEvent) and obj.created_at is None:
            obj.created_at = datetime.now(timezone.utc)
        if isinstance(obj, AlertEvent):
            added.append(obj)

    db = AsyncMock()
    db.add = MagicMock(side_effect=add_side_effect)
    db.flush = AsyncMock()
    empty_scalars = SimpleNamespace(all=lambda: [])
    db.execute = AsyncMock(
        return_value=SimpleNamespace(
            scalar_one_or_none=lambda: None,
            scalars=lambda: empty_scalars,
        )
    )
    return db, added


def _patch_dispatch(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Stub out the channel-registry fan-out used by ``_dispatch_alert_channels``."""

    dispatch_mock = AsyncMock(return_value={})
    monkeypatch.setattr(alert_service, "dispatch_to_channels", dispatch_mock)
    monkeypatch.setattr(
        alert_service,
        "should_dispatch_email_for_severity",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        alert_service,
        "get_notification_settings",
        AsyncMock(return_value={}),
    )
    return dispatch_mock


@pytest.mark.asyncio
@pytest.mark.unit
async def test_alert_disabled_creates_suppressed_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(enabled=False)
    db, added = _db()
    redis = AsyncMock()
    _patch_dispatch(monkeypatch)

    event = await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "uptime_only",
        "downtime",
        "critical",
        "consecutiveFailures:3",
        "Monitor is down",
        db,
        redis,
    )

    assert event is None
    assert len(added) == 1
    assert added[0].suppressed is True
    assert added[0].suppress_reason == "alert_disabled"
    redis.publish.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_alert_quiet_hours_suppresses_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(
        quiet_hours={"start": "00:00", "end": "23:59"},
    )
    db, added = _db()
    _patch_dispatch(monkeypatch)

    event = await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "uptime_only",
        "threshold_breach",
        "warning",
        "responseTime:8000ms",
        "Response time exceeded threshold",
        db,
        redis=None,
        now=datetime(2026, 3, 26, 12, 0, tzinfo=timezone.utc),
    )

    assert event is None
    assert len(added) == 1
    assert added[0].suppressed is True
    assert added[0].suppress_reason == "quiet_hours"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_alert_cooldown_suppresses_repeated_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=300)
    db, added = _db()
    _patch_dispatch(monkeypatch)
    recent = AlertEvent(
        id=uuid4(),
        monitor_id=monitor.id,
        capability="uptime_only",
        event_type="downtime",
        severity="critical",
        threshold_config={},
        actual_value="consecutiveFailures:3",
        message="Monitor is down",
        dispatched_channels=["sse"],
        suppressed=False,
        suppress_reason=None,
    )
    recent.created_at = datetime.now(timezone.utc)
    empty_scalars = SimpleNamespace(all=lambda: [])
    db.execute = AsyncMock(
        return_value=SimpleNamespace(
            scalar_one_or_none=lambda: recent,
            scalars=lambda: empty_scalars,
        )
    )

    event = await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "uptime_only",
        "downtime",
        "critical",
        "consecutiveFailures:3",
        "Monitor is down",
        db,
        redis=None,
    )

    assert event is None
    assert len(added) == 1
    assert added[0].suppressed is True
    assert added[0].suppress_reason == "cooldown"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_alert_dispatch_publishes_sse_and_routes_to_registry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    dispatch_mock = _patch_dispatch(monkeypatch)
    monkeypatch.setattr(
        alert_service,
        "get_notification_settings",
        AsyncMock(
            return_value={
                "webhookEnabled": True,
                "webhookUrl": "https://example.com/hook",
            }
        ),
    )

    event = await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "uptime_only",
        "threshold_breach",
        "warning",
        "responseTime:8000ms",
        "Response time exceeded threshold",
        db,
        redis,
    )

    assert event is not None
    assert len(added) == 1
    assert added[0].suppressed is False
    # The webhook channel is enabled and the registry is the only fan-out.
    assert "sse" in added[0].dispatched_channels
    assert "webhook" in added[0].dispatched_channels
    assert redis.publish.await_count == 2
    dispatch_mock.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_dispatched_channels_include_email_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    _patch_dispatch(monkeypatch)
    monkeypatch.setattr(
        alert_service,
        "should_dispatch_email_for_severity",
        AsyncMock(return_value=True),
    )

    event = await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "uptime_only",
        "downtime",
        "critical",
        "consecutiveFailures:3",
        "Monitor is down",
        db,
        redis,
    )

    assert event is not None
    assert "email" in added[0].dispatched_channels


@pytest.mark.asyncio
@pytest.mark.unit
async def test_email_not_dispatched_when_user_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    _patch_dispatch(monkeypatch)
    monkeypatch.setattr(
        alert_service,
        "should_dispatch_email_for_severity",
        AsyncMock(return_value=False),
    )

    await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "uptime_only",
        "downtime",
        "critical",
        "consecutiveFailures:3",
        "Monitor is down",
        db,
        redis,
    )

    assert "email" not in added[0].dispatched_channels


@pytest.mark.asyncio
@pytest.mark.unit
async def test_email_not_dispatched_for_info_when_info_toggle_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    _patch_dispatch(monkeypatch)

    await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "content_change",
        "content_change",
        "info",
        "diffLines:2",
        "Content changed",
        db,
        redis,
    )

    assert "email" not in added[0].dispatched_channels


@pytest.mark.asyncio
@pytest.mark.unit
async def test_dispatch_recovery_event_sends_pagerduty_resolve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`dispatch_recovery_event` must build a `RESOLVE` PagerDuty payload."""

    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, _ = _db()
    redis = AsyncMock()
    dispatch_mock = _patch_dispatch(monkeypatch)
    monkeypatch.setattr(
        alert_service,
        "get_notification_settings",
        AsyncMock(
            return_value={
                "channels": {
                    "pagerduty": {
                        "enabled": True,
                        "target": "0123456789abcdef0123456789abcdef",
                    }
                }
            }
        ),
    )

    result = await alert_service.dispatch_recovery_event(
        monitor=monitor,
        capability="uptime_only",
        redis=redis,
        db=db,
    )

    dispatch_mock.assert_awaited_once()
    call = dispatch_mock.await_args
    payload = call.kwargs["payload"]
    assert payload.event_type == "status_recovered"
    assert payload.severity == "info"
    assert payload.pagerduty_event_action == alert_service.PagerDutyEventAction.RESOLVE
    assert payload.dedup_key == f"monitor:{monitor.id}:uptime_only"
    assert result == {}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_dispatch_recovery_event_noop_without_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No Redis means we have no notification settings — skip cleanly."""

    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, _ = _db()
    dispatch_mock = _patch_dispatch(monkeypatch)

    result = await alert_service.dispatch_recovery_event(
        monitor=monitor,
        capability="uptime_only",
        redis=None,
        db=db,
    )

    assert result == {}
    dispatch_mock.assert_not_awaited()
