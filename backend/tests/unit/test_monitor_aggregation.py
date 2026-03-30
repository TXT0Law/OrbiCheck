"""Unit tests for monitor aggregation helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorFailureDistribution
from app.models.monitor import CheckErrorType, MonitorCheck
from app.services.monitor_service import (
    _count_incidents_from_successes,
    _current_streak_from_rows,
    _failure_distribution_counts,
    _p95,
)


@pytest.mark.unit
def test_count_incidents_transition_ok_to_fail() -> None:
    assert _count_incidents_from_successes([True, True, False, False, True, False]) == 2


@pytest.mark.unit
def test_count_incidents_empty() -> None:
    assert _count_incidents_from_successes([]) == 0


@pytest.mark.unit
def test_p95_empty() -> None:
    assert _p95([]) == 0.0


@pytest.mark.unit
def test_p95_single() -> None:
    assert _p95([10.0]) == 10.0


@pytest.mark.unit
def test_failure_distribution_buckets() -> None:
    mid = uuid4()
    now = datetime.now(timezone.utc)
    rows = [
        MonitorCheck(
            monitor_id=mid,
            success=False,
            response_time_ms=0,
            error_type=CheckErrorType.TIMEOUT,
            content_changed=False,
            evaluated_capabilities=[],
            checked_at=now,
        ),
        MonitorCheck(
            monitor_id=mid,
            success=False,
            response_time_ms=0,
            error_type=CheckErrorType.DNS_RESOLUTION,
            content_changed=False,
            evaluated_capabilities=[],
            checked_at=now,
        ),
    ]
    dist = _failure_distribution_counts(rows)
    assert isinstance(dist, MonitorFailureDistribution)
    assert dist.TIMEOUT == 1
    assert dist.DNS == 1


@pytest.mark.unit
def test_current_streak_all_up() -> None:
    mid = uuid4()
    t0 = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 3, 1, 12, 5, tzinfo=timezone.utc)
    rows = [
        MonitorCheck(
            monitor_id=mid,
            success=True,
            response_time_ms=10,
            content_changed=False,
            evaluated_capabilities=[],
            checked_at=t0,
        ),
        MonitorCheck(
            monitor_id=mid,
            success=True,
            response_time_ms=12,
            content_changed=False,
            evaluated_capabilities=[],
            checked_at=t1,
        ),
    ]
    streak = _current_streak_from_rows(rows)
    assert streak is not None
    assert streak.status == "up"
    assert streak.since == t0
    assert streak.duration_seconds == 300
