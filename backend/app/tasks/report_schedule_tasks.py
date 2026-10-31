from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import structlog
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.core.celery_app import celery_app
from app.models.report import Report, ReportStatus
from app.models.report_schedule import ReportScheduleRun, ReportScheduleRunStatus
from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.services.report_schedule_service import (
    deliver_scheduled_report,
    dispatch_due_schedules_sync,
)
from app.services.report_service import generate_report_artifacts_sync
from app.services.transformers import ALL_MODULES
from app.tasks.scan_tasks import _get_sync_session, execute_scan
from app.utils.url_safety import validate_url_safety

logger = structlog.get_logger(__name__)

FRESH_SCAN_OPTION_KEYS = (
    "enablePortScan",
    "portScanProfile",
    "acknowledgeScanAuthorization",
)


def _create_fresh_scan(db: Session, source: Scan) -> tuple[Scan, list[str]]:
    """Preserve the source scan's module selection without overwriting its history."""
    validate_url_safety(source.url)
    options = {
        key: source.scan_options[key]
        for key in FRESH_SCAN_OPTION_KEYS
        if isinstance(source.scan_options, dict) and key in source.scan_options
    }
    selected = [
        result.module_name
        for result in source.module_results
        if result.module_name in ALL_MODULES
        and not (isinstance(result.raw_result, dict) and result.raw_result.get("skipped") is True)
    ]
    selected_set = set(selected)
    if not selected_set:
        raise ValueError("Source scan has no selected modules")
    scan = Scan(
        id=uuid.uuid4(),
        url=source.url,
        domain=source.domain,
        user_id=source.user_id,
        status=ScanStatus.PENDING,
        total_modules=len(selected_set),
        scan_options=options,
    )
    db.add(scan)
    db.flush()
    for module_name in ALL_MODULES:
        if module_name in selected_set:
            db.add(ScanModuleResult(
                scan_id=scan.id,
                module_name=module_name,
                status=ModuleStatus.PENDING,
            ))
        else:
            db.add(ScanModuleResult(
                scan_id=scan.id,
                module_name=module_name,
                status=ModuleStatus.SUCCESS,
                raw_result={"skipped": True, "data": {"note": "Skipped by schedule"}},
            ))
    db.flush()
    return scan, [module for module in ALL_MODULES if module in selected_set]


@celery_app.task(name="app.tasks.report_schedule_tasks.dispatch_due_report_schedules")
def dispatch_due_report_schedules() -> dict:
    dispatched = 0
    now = datetime.now(timezone.utc)
    with _get_sync_session() as db:
        runs = dispatch_due_schedules_sync(db, now)
        db.commit()
        for run in runs:
            generate_scheduled_report_run.delay(str(run.id))
            dispatched += 1
    return {"dispatched": dispatched, "checked_at": now.isoformat()}


@celery_app.task(name="app.tasks.report_schedule_tasks.generate_scheduled_report_run")
def generate_scheduled_report_run(run_id: str) -> dict:
    run_uuid = uuid.UUID(run_id)
    with _get_sync_session() as db:
        run = db.execute(
            select(ReportScheduleRun)
            .options(selectinload(ReportScheduleRun.schedule))
            .where(ReportScheduleRun.id == run_uuid)
        ).scalar_one_or_none()
        if run is None:
            return {"run_id": run_id, "status": "not_found"}
        schedule = run.schedule
        if schedule.scan_id and schedule.rescan_before_report:
            scan = db.execute(
                select(Scan)
                .options(selectinload(Scan.module_results))
                .where(Scan.id == schedule.scan_id)
            ).scalar_one_or_none()
        else:
            scan = db.get(Scan, schedule.scan_id) if schedule.scan_id else None
        if scan is None or scan.user_id != schedule.user_id:
            _fail_run(db, run, "Scheduled report scan is missing")
            return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}
        if scan.status != ScanStatus.COMPLETED:
            _fail_run(db, run, "Scheduled report scan is not completed")
            return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}

        if schedule.rescan_before_report:
            try:
                if run.scan_id is None:
                    fresh_scan, modules = _create_fresh_scan(db, scan)
                    run.scan_id = fresh_scan.id
                    run.started_at = datetime.now(timezone.utc)
                    db.commit()
                else:
                    fresh_scan = db.get(Scan, run.scan_id)
                    if fresh_scan is None:
                        _fail_run(db, run, "Scheduled fresh scan is missing")
                        return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}
                    modules = [
                        result.module_name for result in scan.module_results
                        if not (isinstance(result.raw_result, dict) and result.raw_result.get("skipped") is True)
                    ]
                if fresh_scan.status != ScanStatus.COMPLETED:
                    execute_scan.run(str(fresh_scan.id), modules, fresh_scan.scan_options)
                    db.refresh(fresh_scan)
                if fresh_scan.status != ScanStatus.COMPLETED:
                    _fail_run(db, run, "Scheduled fresh scan did not complete")
                    return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}
                scan = fresh_scan
            except (ValueError, RuntimeError, RedisError, SQLAlchemyError) as exc:
                db.rollback()
                _fail_run(db, run, f"Scheduled fresh scan could not start: {exc}")
                return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}

        now = datetime.now(timezone.utc)
        run.status = ReportScheduleRunStatus.GENERATING
        run.started_at = run.started_at or now
        run.error_message = None
        report = Report(
            user_id=schedule.user_id,
            title=f"{schedule.name} - {scan.domain} - {now.strftime('%Y-%m-%d')}",
            format=schedule.format,
            status=ReportStatus.GENERATING,
            scan_id=scan.id,
            monitor_id=schedule.monitor_id,
            monitor_period=schedule.monitor_period,
            report_meta={
                "scanDomain": scan.domain,
                "scanUrl": scan.url,
                "scheduleId": str(schedule.id),
                "scheduleRunId": str(run.id),
            },
        )
        db.add(report)
        db.flush()
        run.report_id = report.id
        db.commit()

        try:
            content_md, content_pdf, content_html, report_meta = generate_report_artifacts_sync(
                db,
                report,
            )
            file_size = len(content_md.encode("utf-8")) + (
                len(content_pdf) if content_pdf else 0
            ) + (len(content_html.encode("utf-8")) if content_html else 0)
            report.status = ReportStatus.COMPLETED
            report.content_md = content_md
            report.content_pdf = content_pdf
            report.content_html = content_html
            report.report_meta = report_meta | {
                "scheduleId": str(schedule.id),
                "scheduleRunId": str(run.id),
            }
            report.file_size_bytes = file_size
            report.completed_at = datetime.now(timezone.utc)
            report.error_message = None
            run.status = ReportScheduleRunStatus.DELIVERING
            db.commit()

            delivery_summary = asyncio.run(
                deliver_scheduled_report(schedule, run, report, scan)
            )
            run.delivery_summary = delivery_summary
            run.status = (
                ReportScheduleRunStatus.COMPLETED
                if delivery_summary.get("success", True)
                else ReportScheduleRunStatus.FAILED
            )
            run.error_message = None if delivery_summary.get("success", True) else "Delivery failed"
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
            return {
                "run_id": run_id,
                "report_id": str(report.id),
                "status": run.status.value,
            }
        except Exception as exc:  # noqa: BLE001 -- scheduled runs must persist failure state
            logger.exception("scheduled_report_run_failed", run_id=run_id)
            report.status = ReportStatus.FAILED
            report.error_message = str(exc)
            report.completed_at = datetime.now(timezone.utc)
            _fail_run(db, run, str(exc))
            return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}


def _fail_run(db, run: ReportScheduleRun, message: str) -> None:
    run.status = ReportScheduleRunStatus.FAILED
    run.error_message = message[:1000]
    run.completed_at = datetime.now(timezone.utc)
    db.commit()
