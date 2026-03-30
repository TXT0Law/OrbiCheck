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
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
    )
    return db, added


@pytest.mark.asyncio
@pytest.mark.unit
async def test_alert_disabled_creates_suppressed_event() -> None:
    monitor = _monitor_with_alerts(enabled=False)
    db, added = _db()
    redis = AsyncMock()

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
async def test_alert_quiet_hours_suppresses_event() -> None:
    monitor = _monitor_with_alerts(
        quiet_hours={"start": "00:00", "end": "23:59"},
    )
    db, added = _db()

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
async def test_alert_cooldown_suppresses_repeated_event() -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=300)
    db, added = _db()
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
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: recent)
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
async def test_alert_dispatch_publishes_sse_and_webhook(monkeypatch: pytest.MonkeyPatch) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    dispatch_wh = AsyncMock()
    should_email = AsyncMock(return_value=False)
    monkeypatch.setattr(alert_service, "dispatch_monitor_webhook", dispatch_wh)
    monkeypatch.setattr(alert_service, "should_dispatch_alert_email", should_email)

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
    assert added[0].dispatched_channels == ["sse", "webhook"]
    assert redis.publish.await_count == 2
    dispatch_wh.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_dispatched_channels_include_email_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    dispatch_webhook = AsyncMock()
    dispatch_email = AsyncMock()
    monkeypatch.setattr(alert_service, "dispatch_monitor_webhook", dispatch_webhook)
    monkeypatch.setattr(alert_service, "dispatch_alert_email", dispatch_email)
    monkeypatch.setattr(
        alert_service,
        "should_dispatch_alert_email",
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
    assert added[0].dispatched_channels == ["sse", "webhook", "email"]
    dispatch_email.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_email_not_dispatched_when_user_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    dispatch_email = AsyncMock()
    monkeypatch.setattr(alert_service, "dispatch_monitor_webhook", AsyncMock())
    monkeypatch.setattr(alert_service, "dispatch_alert_email", dispatch_email)
    monkeypatch.setattr(
        alert_service,
        "should_dispatch_alert_email",
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

    assert added[0].dispatched_channels == ["sse", "webhook"]
    dispatch_email.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_email_not_dispatched_for_info_when_info_toggle_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitor = _monitor_with_alerts(cooldown_seconds=0)
    db, added = _db()
    redis = AsyncMock()
    monkeypatch.setattr(alert_service, "dispatch_monitor_webhook", AsyncMock())
    monkeypatch.setattr(alert_service, "dispatch_alert_email", AsyncMock())
    monkeypatch.setattr(
        alert_service,
        "should_dispatch_alert_email",
        AsyncMock(return_value=False),
    )

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

    assert added[0].dispatched_channels == ["sse", "webhook"]
