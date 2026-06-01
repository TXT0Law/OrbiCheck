from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models.report_schedule import ReportScheduleCadence
from app.services.report_schedule_service import compute_next_run_at


@pytest.mark.unit
def test_compute_next_run_weekly_timezone() -> None:
    result = compute_next_run_at(
        cadence=ReportScheduleCadence.WEEKLY,
        timezone_name="America/New_York",
        day_of_week=0,
        day_of_month=None,
        hour=9,
        minute=30,
        after=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )

    assert result == datetime(2026, 6, 1, 13, 30, tzinfo=timezone.utc)


@pytest.mark.unit
def test_compute_next_run_monthly_clamps_to_last_day() -> None:
    result = compute_next_run_at(
        cadence=ReportScheduleCadence.MONTHLY,
        timezone_name="UTC",
        day_of_week=None,
        day_of_month=31,
        hour=10,
        minute=0,
        after=datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc),
    )

    assert result == datetime(2026, 2, 28, 10, 0, tzinfo=timezone.utc)
