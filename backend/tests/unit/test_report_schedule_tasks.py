"""Fresh scheduled scan planning keeps history and respects module choices."""

import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.models.report import Report, ReportFormat, ReportStatus
from app.models.report_schedule import ReportSchedule, ReportScheduleRun, ReportScheduleRunStatus
from app.tasks import report_schedule_tasks

pytestmark = pytest.mark.unit


def _source_scan() -> Scan:
    source = Scan(
        id=uuid.uuid4(),
        url="https://example.com",
        domain="example.com",
        user_id=7,
        status=ScanStatus.COMPLETED,
        scan_options={
            "enablePortScan": False,
            "portScanProfile": "quick",
            "urlGroupId": "must-not-copy",
        },
    )
    source.module_results = [
        ScanModuleResult(module_name="status", status=ModuleStatus.SUCCESS, raw_result={}),
        ScanModuleResult(
            module_name="ports",
            status=ModuleStatus.SUCCESS,
            raw_result={"skipped": True},
        ),
    ]
    return source


def test_fresh_scan_preserves_source_and_selected_modules(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(report_schedule_tasks, "validate_url_safety", lambda _url: None)
    db = MagicMock()
    source = _source_scan()

    fresh, selected = report_schedule_tasks._create_fresh_scan(db, source)

    assert fresh.id != source.id
    assert fresh.url == source.url
    assert fresh.user_id == source.user_id
    assert fresh.status == ScanStatus.PENDING
    assert fresh.total_modules == 1
    assert fresh.scan_options == {"enablePortScan": False, "portScanProfile": "quick"}
    assert selected == ["status"]
    assert source.status == ScanStatus.COMPLETED
    slots = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], ScanModuleResult)]
    assert next(slot for slot in slots if slot.module_name == "status").status == ModuleStatus.PENDING
    assert next(slot for slot in slots if slot.module_name == "ports").raw_result["skipped"] is True


def test_fresh_scan_rejects_unsafe_target(monkeypatch: pytest.MonkeyPatch) -> None:
    def reject(_url: str) -> None:
        raise ValueError("blocked destination")

    monkeypatch.setattr(report_schedule_tasks, "validate_url_safety", reject)
    db = MagicMock()

    with pytest.raises(ValueError, match="blocked destination"):
        report_schedule_tasks._create_fresh_scan(db, _source_scan())

    db.add.assert_not_called()


def test_fresh_scan_rejects_empty_module_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(report_schedule_tasks, "validate_url_safety", lambda _url: None)
    source = _source_scan()
    source.module_results = [
        ScanModuleResult(
            module_name="ports",
            status=ModuleStatus.SUCCESS,
            raw_result={"skipped": True},
        ),
    ]
    db = MagicMock()

    with pytest.raises(ValueError, match="no selected modules"):
        report_schedule_tasks._create_fresh_scan(db, source)

    db.add.assert_not_called()


@pytest.mark.parametrize(
    "status",
    [
        ReportScheduleRunStatus.GENERATING,
        ReportScheduleRunStatus.DELIVERING,
        ReportScheduleRunStatus.COMPLETED,
        ReportScheduleRunStatus.FAILED,
    ],
)
def test_redelivered_report_run_never_replays_delivery(
    monkeypatch: pytest.MonkeyPatch, status: ReportScheduleRunStatus
) -> None:
    run = ReportScheduleRun(id=uuid.uuid4(), status=status)
    db = MagicMock()
    db.__enter__.return_value = db
    db.execute.return_value.scalar_one_or_none.return_value = run
    monkeypatch.setattr(report_schedule_tasks, "_get_sync_session", lambda: db)
    deliver = MagicMock()
    monkeypatch.setattr(report_schedule_tasks, "deliver_scheduled_report", deliver)
    generate = MagicMock()
    monkeypatch.setattr(report_schedule_tasks, "generate_report_artifacts_sync", generate)

    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))

    assert result == {"run_id": str(run.id), "status": status.value}
    assert run.status == status
    assert run.report_id is None
    deliver.assert_not_called()
    generate.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.parametrize(
    ("delivery_response", "delivery_succeeds"),
    [
        ({"success": True}, True),
        ({"success": False}, False),
        ({}, False),
        ({"success": "true"}, False),
    ],
)
def test_scheduled_report_uses_new_scan_result_and_tracks_delivery(
    monkeypatch: pytest.MonkeyPatch,
    delivery_response: dict[str, object],
    delivery_succeeds: bool,
) -> None:
    source = _source_scan()
    schedule = ReportSchedule(
        id=uuid.uuid4(),
        user_id=source.user_id,
        name="Fresh weekly report",
        scan_id=source.id,
        monitor_id=None,
        monitor_period=None,
        format=ReportFormat.PDF,
        rescan_before_report=True,
        delivery_channels=["email"],
        email_recipients=["ops@example.com"],
    )
    run = ReportScheduleRun(id=uuid.uuid4(), schedule=schedule, status=ReportScheduleRunStatus.PENDING)
    db = MagicMock()
    db.__enter__.return_value = db
    db.execute.return_value.scalar_one_or_none.side_effect = [run, source]
    commit_states: list[tuple[ReportScheduleRunStatus, uuid.UUID | None]] = []
    db.commit.side_effect = lambda: commit_states.append((run.status, run.report_id))

    def mark_scan_complete(scan: Scan) -> None:
        scan.status = ScanStatus.COMPLETED

    db.refresh.side_effect = mark_scan_complete
    monkeypatch.setattr(report_schedule_tasks, "_get_sync_session", lambda: db)
    monkeypatch.setattr(report_schedule_tasks, "validate_url_safety", lambda _url: None)
    scan_task = MagicMock()
    monkeypatch.setattr(report_schedule_tasks.execute_scan, "run", scan_task)
    risk_summary = object()
    risk_period = object()
    summary_loader = MagicMock(return_value=risk_summary)
    monkeypatch.setattr(
        report_schedule_tasks, "load_scheduled_report_risk_summary", summary_loader
    )
    monkeypatch.setattr(
        report_schedule_tasks,
        "present_report_risk_period",
        lambda summary: risk_period if summary is risk_summary else None,
    )
    artifact_generator = MagicMock(
        return_value=(
            "report",
            b"pdf",
            "<p>report</p>",
            {"riskPeriod": {"status": "reported", "version": 1, "endAt": "2026-11-02T00:00:00+00:00"}},
        )
    )
    monkeypatch.setattr(
        report_schedule_tasks,
        "generate_report_artifacts_sync",
        artifact_generator,
    )

    async def deliver(*_args):
        return delivery_response

    monkeypatch.setattr(report_schedule_tasks, "deliver_scheduled_report", deliver)

    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))

    expected_status = (
        ReportScheduleRunStatus.COMPLETED
        if delivery_succeeds
        else ReportScheduleRunStatus.FAILED
    )
    assert result["status"] == expected_status.value
    assert commit_states[0] == (ReportScheduleRunStatus.GENERATING, None)
    claim_query = db.execute.call_args_list[0].args[0]
    claim_sql = str(claim_query.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE OF report_schedule_runs" in claim_sql
    assert run.status == expected_status
    assert run.error_message == (None if delivery_succeeds else "Delivery failed")
    assert run.scan_id != source.id
    scan_task.assert_called_once()
    assert scan_task.call_args.args[0] == str(run.scan_id)
    reports = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], Report)]
    assert len(reports) == 1
    assert reports[0].scan_id == run.scan_id
    assert reports[0].status == ReportStatus.COMPLETED
    assert reports[0].report_meta["riskPeriod"]["status"] == "reported"
    assert source.status == ScanStatus.COMPLETED
    assert summary_loader.call_args.kwargs["user_id"] == source.user_id
    assert summary_loader.call_args.kwargs["domain"] == source.domain
    assert summary_loader.call_args.kwargs["schedule_id"] == schedule.id
    assert artifact_generator.call_args.kwargs["risk_period"] is risk_period
