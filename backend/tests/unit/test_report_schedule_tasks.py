"""Fresh scheduled scan planning keeps history and respects module choices."""

import uuid
from unittest.mock import MagicMock

import pytest

from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.models.report import Report, ReportFormat
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


def test_scheduled_report_uses_new_scan_result(monkeypatch: pytest.MonkeyPatch) -> None:
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
        delivery_channels=[],
        email_recipients=[],
    )
    run = ReportScheduleRun(id=uuid.uuid4(), schedule=schedule, status=ReportScheduleRunStatus.PENDING)
    db = MagicMock()
    db.__enter__.return_value = db
    db.execute.return_value.scalar_one_or_none.side_effect = [run, source]

    def mark_scan_complete(scan: Scan) -> None:
        scan.status = ScanStatus.COMPLETED

    db.refresh.side_effect = mark_scan_complete
    monkeypatch.setattr(report_schedule_tasks, "_get_sync_session", lambda: db)
    monkeypatch.setattr(report_schedule_tasks, "validate_url_safety", lambda _url: None)
    scan_task = MagicMock()
    monkeypatch.setattr(report_schedule_tasks.execute_scan, "run", scan_task)
    monkeypatch.setattr(
        report_schedule_tasks,
        "generate_report_artifacts_sync",
        lambda _db, _report: ("report", b"pdf", "<p>report</p>", {}),
    )

    async def deliver(*_args):
        return {"success": True}

    monkeypatch.setattr(report_schedule_tasks, "deliver_scheduled_report", deliver)

    result = report_schedule_tasks.generate_scheduled_report_run.run(str(run.id))

    assert result["status"] == ReportScheduleRunStatus.COMPLETED.value
    assert run.scan_id != source.id
    scan_task.assert_called_once()
    assert scan_task.call_args.args[0] == str(run.scan_id)
    reports = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], Report)]
    assert len(reports) == 1
    assert reports[0].scan_id == run.scan_id
    assert source.status == ScanStatus.COMPLETED
