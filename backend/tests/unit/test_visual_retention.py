"""visual_retention plan_visual_capture_ids_to_delete."""

from __future__ import annotations

import pytest

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.services.visual_retention import _VisCap, plan_visual_capture_ids_to_delete


@pytest.mark.unit
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


@pytest.mark.unit
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


@pytest.mark.unit
def test_retention_separate_budget_for_diagnostic_captures() -> None:
    """B-3: diagnostic captures must not poison the real-capture budget."""
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)
    real = [
        _VisCap(uuid4(), now - timedelta(minutes=120 - i), is_diagnostic=False)
        for i in range(5)
    ]
    diagnostic = [
        _VisCap(uuid4(), now - timedelta(minutes=60 - i), is_diagnostic=True)
        for i in range(20)
    ]
    captures = real + diagnostic

    ids = plan_visual_capture_ids_to_delete(
        captures,
        now=now,
        max_age_days=365,
        max_per_monitor=10,
        min_retained=2,
        max_diagnostic_per_monitor=5,
    )

    deleted_real = [c for c in real if c.id in ids]
    deleted_diag = [c for c in diagnostic if c.id in ids]
    assert deleted_real == [], "real captures within budget must be kept"
    assert len(deleted_diag) >= 15, (
        "diagnostic rows above the 5-cap should be trimmed independently"
    )


@pytest.mark.unit
def test_retention_keeps_at_least_one_diagnostic_baseline() -> None:
    """Operators must always be able to see the latest failure screenshot."""
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)
    diagnostic = [
        _VisCap(uuid4(), now - timedelta(minutes=60 - i), is_diagnostic=True)
        for i in range(20)
    ]

    ids = plan_visual_capture_ids_to_delete(
        diagnostic,
        now=now,
        max_age_days=365,
        max_per_monitor=10,
        min_retained=5,
        max_diagnostic_per_monitor=1,
    )

    surviving = [c for c in diagnostic if c.id not in ids]
    assert len(surviving) >= 1, "must keep at least one diagnostic baseline"
    # The newest diagnostic capture is never deleted.
    newest = max(diagnostic, key=lambda c: c.captured_at)
    assert newest.id not in ids


@pytest.mark.unit
def test_retention_backward_compatible_default_for_legacy_callers() -> None:
    """When max_diagnostic_per_monitor is omitted, diagnostic rows share the legacy cap."""
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)
    captures = [
        _VisCap(uuid4(), now - timedelta(minutes=30 - i), is_diagnostic=False)
        for i in range(3)
    ] + [
        _VisCap(uuid4(), now - timedelta(minutes=10 - i), is_diagnostic=True)
        for i in range(3)
    ]

    ids = plan_visual_capture_ids_to_delete(
        captures,
        now=now,
        max_age_days=365,
        max_per_monitor=10,
        min_retained=2,
    )

    assert ids == []
