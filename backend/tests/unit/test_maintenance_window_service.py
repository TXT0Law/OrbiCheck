"""Unit tests for Phase 2.4 maintenance window helpers."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.monitor import MaintenanceWindow
from app.services import maintenance_window_service


def _window(
    *,
    user_id: int = 1,
    monitor_id: uuid.UUID | None = None,
    starts_at: datetime,
    ends_at: datetime,
    is_enabled: bool = True,
    suppress_alerts: bool = True,
    suppress_probes: bool = False,
) -> MaintenanceWindow:
    return MaintenanceWindow(
        id=uuid.uuid4(),
        user_id=user_id,
        monitor_id=monitor_id,
        title="weekly deploy",
        starts_at=starts_at,
        ends_at=ends_at,
        is_enabled=is_enabled,
        suppress_alerts=suppress_alerts,
        suppress_probes=suppress_probes,
    )


def _db_returning(rows: list[MaintenanceWindow]) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: rows)
        )
    )
    return db


@pytest.mark.unit
def test_ensure_aware_attaches_utc_when_naive() -> None:
    naive = datetime(2026, 4, 21, 12, 0)
    aware = maintenance_window_service._ensure_aware(naive)
    assert aware.tzinfo is timezone.utc
    already = datetime(2026, 4, 21, tzinfo=timezone.utc)
    assert maintenance_window_service._ensure_aware(already) is already


@pytest.mark.unit
@pytest.mark.asyncio
async def test_is_alert_suppressed_returns_window_when_active() -> None:
    now = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
    monitor_id = uuid.uuid4()
    rows = [
        _window(
            monitor_id=monitor_id,
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(hours=1),
        )
    ]
    db = _db_returning(rows)
    suppressed = await maintenance_window_service.is_alert_suppressed(
        1, monitor_id, db, at=now
    )
    assert suppressed is not None
    assert suppressed.suppress_alerts is True


@pytest.mark.unit
@pytest.mark.asyncio
async def test_is_probe_suppressed_returns_none_when_alert_only() -> None:
    now = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
    rows = [
        _window(
            monitor_id=None,
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(hours=1),
            suppress_alerts=True,
            suppress_probes=False,
        )
    ]
    db = _db_returning(rows)
    suppressed = await maintenance_window_service.is_probe_suppressed(
        1, uuid.uuid4(), db, at=now
    )
    assert suppressed is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_window_rejects_inverted_range() -> None:
    db = AsyncMock()
    starts = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
    ends = starts - timedelta(minutes=5)
    with pytest.raises(ValueError, match="ends_at must be after starts_at"):
        await maintenance_window_service.create_window(
            user_id=1,
            monitor_id=None,
            title="test",
            starts_at=starts,
            ends_at=ends,
            suppress_alerts=True,
            suppress_probes=False,
            notes=None,
            db=db,
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_update_window_returns_none_when_owner_mismatch() -> None:
    db = AsyncMock()
    db.get = AsyncMock(
        return_value=_window(
            user_id=42,
            starts_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ends_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
    )
    result = await maintenance_window_service.update_window(
        window_id=uuid.uuid4(),
        user_id=1,
        db=db,
    )
    assert result is None


# ── Phase 2b — recurrence + tag scope ────────────────────────────────


def _recurring_window(
    *,
    starts_at: datetime,
    ends_at: datetime,
    recurrence: dict,
    tag_scope: list[str] | None = None,
    monitor_id: uuid.UUID | None = None,
) -> MaintenanceWindow:
    row = _window(
        monitor_id=monitor_id,
        starts_at=starts_at,
        ends_at=ends_at,
    )
    row.recurrence = recurrence
    row.tag_scope = tag_scope
    return row


@pytest.mark.unit
def test_occurrence_at_one_shot_inside_range() -> None:
    starts = datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)
    ends = starts + timedelta(hours=2)
    row = _window(starts_at=starts, ends_at=ends)
    occ = maintenance_window_service._occurrence_at(
        row, starts + timedelta(minutes=30)
    )
    assert occ == (starts, ends)


@pytest.mark.unit
def test_occurrence_at_one_shot_outside_range() -> None:
    starts = datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)
    ends = starts + timedelta(hours=2)
    row = _window(starts_at=starts, ends_at=ends)
    occ = maintenance_window_service._occurrence_at(
        row, ends + timedelta(minutes=1)
    )
    assert occ is None


@pytest.mark.unit
def test_occurrence_at_daily_recurrence_matches_future_day() -> None:
    starts = datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)
    ends = starts + timedelta(hours=1)
    row = _recurring_window(
        starts_at=starts,
        ends_at=ends,
        recurrence={"freq": "daily"},
    )
    later = datetime(2026, 4, 23, 10, 30, tzinfo=timezone.utc)
    occ = maintenance_window_service._occurrence_at(row, later)
    assert occ is not None
    occ_start, occ_end = occ
    assert occ_start.date() == later.date()
    assert occ_start.hour == 10 and occ_end.hour == 11


@pytest.mark.unit
def test_occurrence_at_weekly_filters_byweekday() -> None:
    # Tuesday 2026-04-21 → weekday() = 1
    starts = datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)
    ends = starts + timedelta(hours=1)
    row = _recurring_window(
        starts_at=starts,
        ends_at=ends,
        recurrence={"freq": "weekly", "byWeekday": [1]},
    )
    # Wednesday — not in byWeekday set
    next_day = datetime(2026, 4, 22, 10, 30, tzinfo=timezone.utc)
    assert maintenance_window_service._occurrence_at(row, next_day) is None
    # Following Tuesday — should match
    next_tuesday = datetime(2026, 4, 28, 10, 30, tzinfo=timezone.utc)
    occ = maintenance_window_service._occurrence_at(row, next_tuesday)
    assert occ is not None


@pytest.mark.unit
def test_occurrence_at_respects_until_at() -> None:
    starts = datetime(2026, 4, 21, 10, 0, tzinfo=timezone.utc)
    ends = starts + timedelta(hours=1)
    row = _recurring_window(
        starts_at=starts,
        ends_at=ends,
        recurrence={
            "freq": "daily",
            "untilAt": (starts + timedelta(days=1)).isoformat(),
        },
    )
    later = datetime(2026, 4, 25, 10, 30, tzinfo=timezone.utc)
    assert maintenance_window_service._occurrence_at(row, later) is None


@pytest.mark.unit
def test_matches_tag_scope_empty_scope_matches_all() -> None:
    row = _window(
        starts_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ends_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    row.tag_scope = None
    assert maintenance_window_service._matches_tag_scope(row, ["anything"])
    assert maintenance_window_service._matches_tag_scope(row, [])


@pytest.mark.unit
def test_matches_tag_scope_requires_intersection() -> None:
    row = _window(
        starts_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ends_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    row.tag_scope = ["prod"]
    assert maintenance_window_service._matches_tag_scope(row, ["prod", "edge"])
    assert not maintenance_window_service._matches_tag_scope(row, ["staging"])
    assert not maintenance_window_service._matches_tag_scope(row, [])
    assert not maintenance_window_service._matches_tag_scope(row, None)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_list_active_windows_filters_by_tag_scope() -> None:
    now = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
    monitor_id = uuid.uuid4()
    matching = _window(
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    matching.tag_scope = ["prod"]
    not_matching = _window(
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    not_matching.tag_scope = ["staging"]
    db = _db_returning([matching, not_matching])
    results = await maintenance_window_service.list_active_windows(
        1, monitor_id, db, at=now, monitor_tags=["prod"]
    )
    assert len(results) == 1
    assert results[0].id == matching.id
