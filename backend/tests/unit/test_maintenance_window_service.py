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
