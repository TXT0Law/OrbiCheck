from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from kombu.exceptions import OperationalError
from sqlalchemy.dialects import postgresql

from app.models.report import ReportFormat
from app.models.report_schedule import ReportSchedule, ReportScheduleRun, ReportScheduleRunStatus
from app.models.scan import Scan, ScanStatus
from app.tasks import report_schedule_tasks


@pytest.fixture
def scheduled_run(monkeypatch):
    run = ReportScheduleRun(id=uuid4(), status=ReportScheduleRunStatus.PENDING)
    run.schedule = ReportSchedule(
        id=uuid4(), name="Weekly check", user_id=1, scan_id=uuid4(),
        is_enabled=True, format=ReportFormat.PDF,
    )
    db = MagicMock()
    db.__enter__.return_value = db
    db.execute.return_value.scalar_one_or_none.return_value = run
    db.get.return_value = Scan(
        id=run.schedule.scan_id, user_id=1, domain="example.com", status=ScanStatus.COMPLETED,
    )
    monkeypatch.setattr(report_schedule_tasks, "_get_sync_session", lambda: db)
    delivery = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(report_schedule_tasks, "deliver_scheduled_report", delivery)
    monkeypatch.setattr(
        report_schedule_tasks, "generate_report_artifacts_sync", lambda *_: ("report", None, None, {}),
    )
    return run, db, delivery


@pytest.mark.unit
@pytest.mark.parametrize("status", [
    ReportScheduleRunStatus.GENERATING,
    ReportScheduleRunStatus.DELIVERING,
    ReportScheduleRunStatus.COMPLETED,
    ReportScheduleRunStatus.FAILED,
])
def test_redelivery_cannot_restart_an_existing_run(scheduled_run, status) -> None:
    run, db, delivery = scheduled_run
    run.status = status
    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))

    assert result == {"run_id": str(run.id), "status": status.value}
    db.add.assert_not_called()
    db.commit.assert_not_called()
    delivery.assert_not_called()


@pytest.mark.unit
@pytest.mark.parametrize("enabled,allow_paused,expected", [
    (False, False, "failed"), (False, True, "completed"), (True, False, "completed"),
])
def test_worker_honors_manual_pause_intent(scheduled_run, enabled, allow_paused, expected) -> None:
    run, _, delivery = scheduled_run
    run.schedule.is_enabled = enabled
    run.allow_paused = allow_paused
    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))
    assert result["status"] == expected
    assert delivery.await_count == int(expected == "completed")


@pytest.mark.unit
def test_pause_while_rendering_stops_external_delivery(scheduled_run) -> None:
    run, db, delivery = scheduled_run
    db.refresh.side_effect = lambda schedule, **_: setattr(schedule, "is_enabled", False)
    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))
    assert result["status"] == "failed"
    assert "paused" in run.error_message
    delivery.assert_not_called()


@pytest.mark.unit
@pytest.mark.parametrize("summary,expected", [
    ({"success": False, "outcome": "unconfirmed"}, "delivering"),
    ({}, "failed"), ({"success": "yes"}, "failed"), ({"success": True}, "completed"),
])
def test_delivery_confirmation_is_explicit(scheduled_run, summary, expected) -> None:
    run, _, delivery = scheduled_run
    delivery.return_value = summary
    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))
    assert result["status"] == expected
    assert (run.completed_at is None) == (expected == "delivering")


@pytest.mark.unit
def test_failed_publisher_only_releases_its_pending_reservation(monkeypatch) -> None:
    run_id = uuid4()
    deadline = datetime.now(timezone.utc)
    db = MagicMock()
    db.__enter__.return_value = db
    monkeypatch.setattr(report_schedule_tasks, "_get_sync_session", lambda: db)
    publish = MagicMock(side_effect=OperationalError("broker unavailable"))
    monkeypatch.setattr(report_schedule_tasks.generate_scheduled_report_run, "apply_async", publish)

    assert not report_schedule_tasks.publish_report_run(run_id, deadline, ignore_result=True)

    publish.assert_called_once_with(args=(str(run_id),), retry=False, ignore_result=True)
    query = db.execute.call_args.args[0].compile(dialect=postgresql.dialect())
    assert {run_id, deadline, ReportScheduleRunStatus.PENDING} == set(query.params.values())
    assert "report_schedule_runs.next_dispatch_at =" in str(query)
    db.commit.assert_called_once()
