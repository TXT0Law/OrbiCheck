"""visual_retention plan_visual_capture_ids_to_delete."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.services.visual_retention import _VisCap, plan_visual_capture_ids_to_delete


def test_retention_protects_newest_min_retained() -> None:
    now = datetime(2026, 3, 25, tzinfo=timezone.utc)
    caps = [
        _VisCap(uuid4(), now - timedelta(days=100)),
        _VisCap(uuid4(), now - timedelta(days=1)),
    ]
    ids = plan_visual_capture_ids_to_delete(
        caps,
        now=now,
        max_age_days=90,
        max_per_monitor=10,
        min_retained=1,
    )
    assert len(ids) == 1
    assert ids[0] == caps[0].id


def test_retention_respects_count_cap() -> None:
    now = datetime(2026, 3, 25, tzinfo=timezone.utc)
    caps = [
        _VisCap(uuid4(), now - timedelta(hours=i)) for i in range(10, 0, -1)
    ]
    ids = plan_visual_capture_ids_to_delete(
        caps,
        now=now,
        max_age_days=365,
        max_per_monitor=3,
        min_retained=2,
    )
    assert len(ids) >= 1
