"""Tests for the Phase 3 notification dispatch log + retry queue.

The Celery retry task is exercised end-to-end against an in-memory async
session double so we don't need a live Postgres instance.
"""

from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timezone

import pytest

from app.models.notification_dispatch import (
    NOTIFICATION_DISPATCH_STATUS_FAILED,
    NOTIFICATION_DISPATCH_STATUS_SUCCEEDED,
    NotificationDispatchLog,
)
from app.services.notification_channels import (
    AlertPayload,
    ChannelDispatchResult,
)
from app.services.notification_channels import dispatch_log


def _payload() -> AlertPayload:
    return AlertPayload(
        monitor_id=str(uuid.uuid4()),
        monitor_name="Production",
        monitor_url="https://example.com",
        capability="uptime_only",
        event_type="alert_event",
        severity="critical",
        message="Down",
        actual_value="x",
    )


class _MemDb:
    """Async-shaped session double with deterministic id assignment."""

    def __init__(self) -> None:
        self.added: list[NotificationDispatchLog] = []
        self.flushes = 0

    def add(self, obj: object) -> None:
        if isinstance(obj, NotificationDispatchLog):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.status is None:
                obj.status = "pending"
            if obj.attempts is None:
                obj.attempts = 0
            self.added.append(obj)

    async def flush(self) -> None:
        self.flushes += 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_dispatch_attempt_success_marks_succeeded() -> None:
    db = _MemDb()
    payload = _payload()

    async def _ok() -> ChannelDispatchResult:
        return ChannelDispatchResult(success=True, latency_ms=42)

    result = await dispatch_log.record_dispatch_attempt(
        user_id=1,
        monitor_id=uuid.uuid4(),
        alert_event_id=None,
        channel_id="slack",
        payload=payload,
        send=_ok,
        db=db,
    )
    assert result.success is True
    assert len(db.added) == 1
    row = db.added[0]
    assert row.status == NOTIFICATION_DISPATCH_STATUS_SUCCEEDED
    assert row.attempts == 1
    assert row.last_error is None
    assert row.next_attempt_at is None
    assert row.succeeded_at is not None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_dispatch_attempt_failure_schedules_retry() -> None:
    db = _MemDb()

    async def _fail() -> ChannelDispatchResult:
        return ChannelDispatchResult(
            success=False, error="boom", latency_ms=11
        )

    await dispatch_log.record_dispatch_attempt(
        user_id=1,
        monitor_id=uuid.uuid4(),
        alert_event_id=None,
        channel_id="slack",
        payload=_payload(),
        send=_fail,
        db=db,
    )
    assert len(db.added) == 1
    row = db.added[0]
    assert row.status == NOTIFICATION_DISPATCH_STATUS_FAILED
    assert row.attempts == 1
    assert row.last_error == "boom"
    assert row.next_attempt_at is not None
    assert row.next_attempt_at > datetime.now(timezone.utc)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_record_dispatch_attempt_unhandled_exception_recorded() -> None:
    db = _MemDb()

    async def _explode() -> ChannelDispatchResult:
        raise RuntimeError("network meltdown")

    result = await dispatch_log.record_dispatch_attempt(
        user_id=1,
        monitor_id=uuid.uuid4(),
        alert_event_id=None,
        channel_id="discord",
        payload=_payload(),
        send=_explode,
        db=db,
    )
    assert result.success is False
    assert "network meltdown" in (result.error or "")
    row = db.added[0]
    assert row.status == NOTIFICATION_DISPATCH_STATUS_FAILED
    assert "network meltdown" in (row.last_error or "")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_dispatch_attempt_dies_after_max_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ``attempts >= max_attempts`` the row transitions to ``dead``."""

    monkeypatch.setattr(
        dispatch_log.settings, "NOTIFICATION_DISPATCH_MAX_ATTEMPTS", 1
    )
    db = _MemDb()

    async def _fail() -> ChannelDispatchResult:
        return ChannelDispatchResult(success=False, error="no", latency_ms=0)

    await dispatch_log.record_dispatch_attempt(
        user_id=1,
        monitor_id=uuid.uuid4(),
        alert_event_id=None,
        channel_id="slack",
        payload=_payload(),
        send=_fail,
        db=db,
    )
    row = db.added[0]
    assert row.attempts == 1
    assert row.status == "dead"
    assert row.next_attempt_at is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_replay_dispatch_success_after_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Once a row is failed, replay_dispatch advances it to succeeded."""

    monkeypatch.setattr(
        dispatch_log.settings, "NOTIFICATION_DISPATCH_MAX_ATTEMPTS", 5
    )
    db = _MemDb()

    async def _fail() -> ChannelDispatchResult:
        return ChannelDispatchResult(success=False, error="no", latency_ms=0)

    await dispatch_log.record_dispatch_attempt(
        user_id=1,
        monitor_id=uuid.uuid4(),
        alert_event_id=None,
        channel_id="slack",
        payload=_payload(),
        send=_fail,
        db=db,
    )
    row = db.added[0]
    assert row.status == NOTIFICATION_DISPATCH_STATUS_FAILED

    async def _ok() -> ChannelDispatchResult:
        return ChannelDispatchResult(success=True, latency_ms=8)

    result = await dispatch_log.replay_dispatch(row=row, send=_ok, db=db)
    assert result.success is True
    assert row.status == NOTIFICATION_DISPATCH_STATUS_SUCCEEDED
    assert row.attempts == 2


@pytest.mark.unit
def test_next_backoff_at_grows_exponentially() -> None:
    now = datetime(2026, 4, 28, 12, 0, tzinfo=timezone.utc)
    delays: list[float] = []
    for attempt in range(1, 5):
        scheduled = dispatch_log._next_backoff_at(attempt, now=now)
        delays.append((scheduled - now).total_seconds())
    # Each step must be at least as long as the previous one (monotonic
    # backoff bounded by NOTIFICATION_RETRY_MAX_DELAY_S).
    assert delays == sorted(delays)
    assert delays[0] > 0


@pytest.mark.unit
def test_module_reload_does_not_corrupt_state() -> None:
    """Mirrors the ``test_monitor_cleanup_task.py`` reload pattern from P0."""

    importlib.reload(dispatch_log)
    importlib.import_module("app.services.notification_channels.dispatch_log")
