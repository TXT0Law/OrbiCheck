"""Unit tests for snapshot retention planning."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.services.snapshot_retention import _Snap, plan_snapshot_ids_to_delete


def _dt(days_ago: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


def test_baseline_never_deleted() -> None:
    bid = uuid4()
    snaps = [
        _Snap(bid, _dt(200), True),
        _Snap(uuid4(), _dt(10), False),
        _Snap(uuid4(), _dt(9), False),
        _Snap(uuid4(), _dt(8), False),
        _Snap(uuid4(), _dt(7), False),
        _Snap(uuid4(), _dt(6), False),
    ]
    to_del = plan_snapshot_ids_to_delete(
        snaps,
        now=datetime.now(timezone.utc),
        max_age_days=90,
        max_snapshots_per_monitor=3,
        min_retained_snapshots=2,
    )
    assert bid not in to_del


def test_max_snapshots_drops_oldest_non_protected() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    snaps = [
        _Snap(a, _dt(3), False),
        _Snap(b, _dt(2), False),
        _Snap(c, _dt(1), False),
    ]
    to_del = plan_snapshot_ids_to_delete(
        snaps,
        now=datetime.now(timezone.utc),
        max_age_days=365,
        max_snapshots_per_monitor=2,
        min_retained_snapshots=1,
    )
    assert c not in to_del
    assert a in to_del


def test_old_snapshots_outside_age_deleted() -> None:
    old_id = uuid4()
    new_id = uuid4()
    snaps = [
        _Snap(old_id, _dt(400), False),
        _Snap(new_id, _dt(1), False),
    ]
    to_del = plan_snapshot_ids_to_delete(
        snaps,
        now=datetime.now(timezone.utc),
        max_age_days=90,
        max_snapshots_per_monitor=100,
        min_retained_snapshots=1,
    )
    assert old_id in to_del
    assert new_id not in to_del


def test_short_list_no_delete() -> None:
    snaps = [_Snap(uuid4(), _dt(1), False)]
    to_del = plan_snapshot_ids_to_delete(
        snaps,
        now=datetime.now(timezone.utc),
        max_age_days=1,
        max_snapshots_per_monitor=100,
        min_retained_snapshots=5,
    )
    assert to_del == []
