from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models.report import Report, ReportFormat
from app.models.report_schedule import ReportSchedule, ReportScheduleCadence, ReportScheduleRun, ReportScheduleRunStatus
from app.models.scan import Scan
from app.services import report_schedule_service
from app.services.outbound_http import OutboundResponseTooLarge
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


@pytest.mark.unit
def test_reserve_dispatch_is_bounded_and_orders_by_oldest_eligibility() -> None:
    db = MagicMock()
    run = ReportScheduleRun(id=uuid4())
    db.scalars.return_value.all.return_value = [run]
    now = datetime.now(timezone.utc)
    deadline = now + report_schedule_service.REPORT_DISPATCH_LEASE

    assert report_schedule_service.reserve_pending_report_runs(db, now, deadline) == [run.id]
    assert run.next_dispatch_at == deadline
    query = db.scalars.call_args.args[0].compile(dialect=postgresql.dialect())
    assert "ORDER BY report_schedule_runs.next_dispatch_at, report_schedule_runs.id" in str(query)
    assert "FOR UPDATE SKIP LOCKED" in str(query)
    assert set(query.params.values()) == {
        now, ReportScheduleRunStatus.PENDING, report_schedule_service.DISPATCH_BATCH_LIMIT,
    }


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("enabled", [True, False])
async def test_manual_run_records_pause_intent_at_request_time(monkeypatch, enabled) -> None:
    schedule = ReportSchedule(id=uuid4(), scan_id=uuid4(), is_enabled=enabled)
    db = MagicMock()
    db.flush = AsyncMock()
    monkeypatch.setattr(report_schedule_service, "get_schedule", AsyncMock(return_value=schedule))
    run = await report_schedule_service.create_schedule_run(db, schedule.id, 1)
    assert run.allow_paused is (not enabled)


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("channels,recipients,expected", [
    ([], [], True), (["email"], [], False), (["invalid-channel"], [], False),
])
async def test_validate_persisted_destinations_before_send(monkeypatch, channels, recipients, expected) -> None:
    schedule = ReportSchedule(delivery_channels=channels, email_recipients=recipients)
    sender = AsyncMock()
    monkeypatch.setattr(report_schedule_service.email_service, "send_report_email", sender)
    result = await report_schedule_service.deliver_scheduled_report(
        schedule, ReportScheduleRun(id=uuid4()), Report(id=uuid4()), Scan(domain="example.com"),
    )
    assert result["success"] is expected
    sender.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_missing_smtp_acknowledgement_remains_unconfirmed(monkeypatch) -> None:
    recipient = "ops@example.com"
    schedule = ReportSchedule(delivery_channels=["email"], email_recipients=[recipient])
    sender = AsyncMock(side_effect=TimeoutError("no final response"))
    monkeypatch.setattr(report_schedule_service.email_service, "send_report_email", sender)
    result = await report_schedule_service.deliver_scheduled_report(
        schedule, ReportScheduleRun(id=uuid4()), Report(id=uuid4()), Scan(domain="example.com"),
    )
    assert result["outcome"] == "unconfirmed"
    assert result["success"] is False
    assert result["channels"]["email"][0]["recipient"] == recipient


@pytest.mark.unit
@pytest.mark.asyncio
async def test_oversized_slack_reply_is_unconfirmed_without_redirect_replay(monkeypatch) -> None:
    target = "https://hooks.slack.com/services/test"
    schedule = ReportSchedule(user_id=1, delivery_channels=["slack"])
    sender = AsyncMock(side_effect=OutboundResponseTooLarge("response body too large"))
    monkeypatch.setattr(report_schedule_service, "_resolve_slack_target", lambda _: target)
    monkeypatch.setattr(report_schedule_service, "validate_target_url", lambda url: url)
    monkeypatch.setattr(report_schedule_service, "post_json", sender)
    result = await report_schedule_service.deliver_scheduled_report(
        schedule, ReportScheduleRun(id=uuid4()), Report(id=uuid4(), format=ReportFormat.PDF),
        Scan(domain="example.com"),
    )
    assert result["outcome"] == "unconfirmed"
    assert result["success"] is False
    assert sender.await_args.kwargs["max_redirects"] == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_exact_run_scopes_owner_schedule_and_run_without_history() -> None:
    from app.core.exceptions import NotFoundError

    schedule_id, run_id = uuid4(), uuid4()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    with pytest.raises(NotFoundError) as error:
        await report_schedule_service.get_schedule_run(db, schedule_id, run_id, 72)
    assert error.value.code == 'REPORT_SCHEDULE_RUN_NOT_FOUND'
    query = db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
    assert set(query.params.values()) == {schedule_id, run_id, 72}
    assert 'JOIN report_schedules ON report_schedule_runs.schedule_id = report_schedules.id' in str(query)
    assert not db.execute.call_args.args[0]._with_options
