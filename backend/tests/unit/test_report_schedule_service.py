from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models.report import Report
from app.models.report_schedule import (
    ReportSchedule,
    ReportScheduleCadence,
    ReportScheduleRun,
    ReportScheduleRunStatus,
)
from app.models.scan import Scan
from app.services import report_schedule_service
from app.services.report_schedule_service import (
    STALLED_REPORT_RUN_AGE,
    STALLED_REPORT_RUN_SAMPLE_SIZE,
    compute_next_run_at,
    deliver_scheduled_report,
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


@pytest.mark.unit
@pytest.mark.asyncio
async def test_email_delivery_without_recipients_reports_failure_without_sending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A persisted invalid email schedule must report failure without sending."""
    send_email = AsyncMock()
    monkeypatch.setattr(report_schedule_service.email_service, "send_report_email", send_email)
    schedule = ReportSchedule(
        id=uuid4(),
        user_id=7,
        name="Weekly risk report",
        delivery_channels=["email"],
        email_recipients=[],
    )
    run = ReportScheduleRun(id=uuid4())
    report = Report(id=uuid4())
    scan = Scan(domain="example.com")

    summary = await deliver_scheduled_report(schedule, run, report, scan)

    assert summary["success"] is False
    assert summary["channels"]["email"] == [
        {
            "recipient": "",
            "success": False,
            "error": "email_recipients_missing",
            "latencyMs": 0,
        }
    ]
    send_email.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "channels",
    [["unsupported"], ["email", "unsupported"], "email", None],
)
async def test_invalid_persisted_delivery_channels_fail_before_any_send(
    monkeypatch: pytest.MonkeyPatch, channels: object
) -> None:
    send_email = AsyncMock()
    send_slack = AsyncMock()
    resolve_slack = MagicMock()
    monkeypatch.setattr(report_schedule_service.email_service, "send_report_email", send_email)
    monkeypatch.setattr(report_schedule_service, "post_json", send_slack)
    monkeypatch.setattr(report_schedule_service, "_resolve_slack_target", resolve_slack)
    schedule = ReportSchedule(
        id=uuid4(),
        user_id=7,
        name="Weekly risk report",
        delivery_channels=channels,
        email_recipients=["ops@example.com"],
    )
    run = ReportScheduleRun(id=uuid4())
    report = Report(id=uuid4())
    scan = Scan(domain="example.com")

    summary = await deliver_scheduled_report(schedule, run, report, scan)

    assert summary["success"] is False
    assert summary["error"] == "invalid_delivery_channels"
    assert summary["channels"] == {}
    assert summary["runId"] == str(run.id)
    send_email.assert_not_awaited()
    send_slack.assert_not_awaited()
    resolve_slack.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_enabled", ["false", 1])
async def test_scheduled_slack_delivery_requires_boolean_opt_in(
    monkeypatch: pytest.MonkeyPatch, invalid_enabled: object
) -> None:
    redis_client = MagicMock()
    redis_client.get.return_value = json.dumps({
        "channels": {
            "slack": {
                "enabled": invalid_enabled,
                "target": "https://hooks.slack.com/services/T/B/key",
            }
        }
    })
    monkeypatch.setattr(
        report_schedule_service.redis_sync.Redis,
        "from_url",
        MagicMock(return_value=redis_client),
    )
    send_slack = AsyncMock()
    monkeypatch.setattr(report_schedule_service, "post_json", send_slack)
    schedule = ReportSchedule(
        id=uuid4(), user_id=7, name="Weekly report", delivery_channels=["slack"]
    )

    summary = await deliver_scheduled_report(
        schedule,
        ReportScheduleRun(id=uuid4()),
        Report(id=uuid4()),
        Scan(domain="example.com"),
    )

    assert summary["success"] is False
    assert summary["channels"]["slack"]["error"] == "slack_not_configured"
    send_slack.assert_not_awaited()
    redis_client.close.assert_called_once()
