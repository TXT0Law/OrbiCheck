"""Unit tests for monitor change retention planning."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.services.change_retention import (
    _Chg,
    _ChgDedup,
    plan_change_ids_to_delete,
    plan_consecutive_duplicate_fingerprint_deletions,
)


def _dt(days_ago: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


def test_max_changes_drops_oldest_non_protected() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    rows = [
        _Chg(a, _dt(3)),
        _Chg(b, _dt(2)),
        _Chg(c, _dt(1)),
    ]
    to_del = plan_change_ids_to_delete(
        rows,
        now=datetime.now(timezone.utc),
        max_age_days=365,
        max_changes_per_monitor=2,
        min_retained_changes=1,
    )
    assert c not in to_del
    assert a in to_del


def test_old_changes_outside_age_deleted() -> None:
    old_id = uuid4()
    new_id = uuid4()
    rows = [
        _Chg(old_id, _dt(400)),
        _Chg(new_id, _dt(1)),
    ]
    to_del = plan_change_ids_to_delete(
        rows,
        now=datetime.now(timezone.utc),
        max_age_days=90,
        max_changes_per_monitor=1000,
        min_retained_changes=1,
    )
    assert old_id in to_del
    assert new_id not in to_del


def test_short_list_no_delete() -> None:
    rows = [_Chg(uuid4(), _dt(1))]
    to_del = plan_change_ids_to_delete(
        rows,
        now=datetime.now(timezone.utc),
        max_age_days=1,
        max_changes_per_monitor=100,
        min_retained_changes=5,
    )
    assert to_del == []


def test_newest_min_retained_protected_even_if_very_old() -> None:
    """Oldest among the min_retained newest must survive age cutoff."""
    ids = [uuid4() for _ in range(4)]
    rows = [
        _Chg(ids[0], _dt(400)),
        _Chg(ids[1], _dt(300)),
        _Chg(ids[2], _dt(200)),
        _Chg(ids[3], _dt(100)),
    ]
    to_del = plan_change_ids_to_delete(
        rows,
        now=datetime.now(timezone.utc),
        max_age_days=30,
        max_changes_per_monitor=100,
        min_retained_changes=3,
    )
    for i in (1, 2, 3):
        assert ids[i] not in to_del
    assert ids[0] in to_del


@pytest.mark.unit
def test_duplicate_fingerprint_marks_older_for_delete() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    fp = "ab" * 32
    now = datetime.now(timezone.utc)
    rows = [
        _ChgDedup(a, now - timedelta(seconds=100), fp),
        _ChgDedup(b, now - timedelta(seconds=50), fp),
        _ChgDedup(c, now, "cd" * 32),
    ]
    protected = frozenset({c})
    to_del = plan_consecutive_duplicate_fingerprint_deletions(
        rows,
        window_seconds=3600.0,
        protected=protected,
    )
    assert a in to_del
    assert b not in to_del


@pytest.mark.unit
def test_duplicate_fingerprint_respects_window() -> None:
    a, b = uuid4(), uuid4()
    fp = "ef" * 32
    now = datetime.now(timezone.utc)
    rows = [
        _ChgDedup(a, now - timedelta(seconds=10_000), fp),
        _ChgDedup(b, now, fp),
    ]
    to_del = plan_consecutive_duplicate_fingerprint_deletions(
        rows,
        window_seconds=60.0,
        protected=frozenset(),
    )
    assert to_del == []
