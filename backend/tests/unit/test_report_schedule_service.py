from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models.report_schedule import ReportScheduleCadence, ReportScheduleRunStatus
from app.services.report_schedule_service import (
    STALLED_REPORT_RUN_AGE,
    STALLED_REPORT_RUN_SAMPLE_SIZE,
    compute_next_run_at,
    list_stalled_report_run_ids_sync,
)


@pytest.mark.unit
def test_stalled_report_sample_is_bounded_and_read_only() -> None:
    db = MagicMock()
    stalled_id = uuid4()
    db.scalars.return_value.all.return_value = [stalled_id]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)

    assert list_stalled_report_run_ids_sync(db, now) == [stalled_id]

    query = db.scalars.call_args.args[0]
    compiled = query.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "report_schedule_runs.started_at <" in sql
    assert "report_schedule_runs.completed_at IS NULL" in sql
    assert "ORDER BY report_schedule_runs.started_at, report_schedule_runs.id" in sql
    assert "FOR UPDATE" not in sql
    assert STALLED_REPORT_RUN_SAMPLE_SIZE in compiled.params.values()
    assert [
        ReportScheduleRunStatus.GENERATING,
        ReportScheduleRunStatus.DELIVERING,
    ] in compiled.params.values()
    assert now - STALLED_REPORT_RUN_AGE in compiled.params.values()
    db.commit.assert_not_called()


@pytest.mark.unit
def test_stalled_report_sample_rejects_naive_inspection_time() -> None:
    db = MagicMock()

    with pytest.raises(ValueError, match="timezone"):
        list_stalled_report_run_ids_sync(db, datetime(2026, 11, 2))

    db.scalars.assert_not_called()


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
