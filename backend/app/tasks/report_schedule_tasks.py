from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import structlog
from kombu.exceptions import OperationalError
from redis.exceptions import RedisError
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.core.celery_app import celery_app
from app.models.report import Report, ReportStatus
from app.models.report_schedule import ReportScheduleRun, ReportScheduleRunStatus
from app.models.scan import Scan, ScanStatus
from app.services.report_schedule_service import (
    REPORT_DISPATCH_LEASE,
    deliver_scheduled_report,
    dispatch_due_schedules_sync,
    reserve_pending_report_runs,
)
from app.services.report_service import generate_report_artifacts_sync
from app.tasks.scan_tasks import _get_sync_session

logger = structlog.get_logger(__name__)
REPORT_RUN_ERROR_LIMIT = 1000


def publish_report_run(run_id: uuid.UUID, reserved_until: datetime, *, ignore_result: bool = False) -> bool:
    """A pending database run survives an unavailable or uncertain publisher."""
    try:
        generate_scheduled_report_run.apply_async(args=(str(run_id),), retry=False, ignore_result=ignore_result)
    except (OperationalError, RedisError, OSError) as exc:
        logger.warning("report_run_publish_unconfirmed", run_id=str(run_id), error_type=type(exc).__name__)
        try:
            with _get_sync_session() as db:
                db.execute(
                    update(ReportScheduleRun)
                    .where(
                        ReportScheduleRun.id == run_id,
                        ReportScheduleRun.status == ReportScheduleRunStatus.PENDING,
                        ReportScheduleRun.next_dispatch_at == reserved_until,
                    )
                    .values(next_dispatch_at=func.now())
                )
                db.commit()
        except SQLAlchemyError:
            # A dead publisher or unavailable database is recovered on lease expiry.
            logger.exception("report_run_publish_lease_not_released", run_id=str(run_id))
        return False
    return True


@celery_app.task(name="app.tasks.report_schedule_tasks.dispatch_due_report_schedules")
def dispatch_due_report_schedules() -> dict:
    now = datetime.now(timezone.utc)
    reserved_until = now + REPORT_DISPATCH_LEASE
    with _get_sync_session() as db:
        dispatch_due_schedules_sync(db, now)
        run_ids = reserve_pending_report_runs(db, now, reserved_until)
        db.commit()
    dispatched = sum(publish_report_run(run_id, reserved_until) for run_id in run_ids)
    return {"dispatched": dispatched, "checked_at": now.isoformat()}


@celery_app.task(name="app.tasks.report_schedule_tasks.generate_scheduled_report_run")
def generate_scheduled_report_run(run_id: str) -> dict:
    run_uuid = uuid.UUID(run_id)
    with _get_sync_session() as db:
        # Keep the delivery inputs available after the final database transaction.
        db.expire_on_commit = False
        run = db.execute(
            select(ReportScheduleRun)
            .options(selectinload(ReportScheduleRun.schedule))
            .where(ReportScheduleRun.id == run_uuid)
            .with_for_update(of=ReportScheduleRun)
        ).scalar_one_or_none()
        if run is None:
            return {"run_id": run_id, "status": "not_found"}
        if run.status != ReportScheduleRunStatus.PENDING:
            return {"run_id": run_id, "status": run.status.value}
        schedule = run.schedule
        if not schedule.is_enabled and not run.allow_paused:
            _fail_run(db, run, "Scheduled report was paused before generation")
            return {"run_id": run_id, "status": run.status.value}
        scan = db.get(Scan, schedule.scan_id) if schedule.scan_id else None
        if scan is None or scan.user_id != schedule.user_id:
            _fail_run(db, run, "Scheduled report scan is missing")
            return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}
        if scan.status != ScanStatus.COMPLETED:
            _fail_run(db, run, "Scheduled report scan is not completed")
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
            db.refresh(schedule, attribute_names=["is_enabled", "delivery_channels", "email_recipients"])
            if not schedule.is_enabled and not run.allow_paused:
                _fail_run(db, run, "Scheduled report was paused before delivery")
                return {"run_id": run_id, "status": run.status.value}
            run.status = ReportScheduleRunStatus.DELIVERING
            run.delivery_summary = {"outcome": "unconfirmed"}
            db.commit()
        except Exception as exc:  # noqa: BLE001 -- scheduled runs must persist failure state
            logger.exception("scheduled_report_run_failed", run_id=run_id)
            db.rollback()
            report.status = ReportStatus.FAILED
            report.error_message = str(exc)
            report.completed_at = datetime.now(timezone.utc)
            _fail_run(db, run, str(exc))
            return {"run_id": run_id, "status": ReportScheduleRunStatus.FAILED.value}

        # A crash or missing provider acknowledgement after this point may mean a
        # message was accepted. Never repeat external I/O for this run.
        delivery_summary = asyncio.run(deliver_scheduled_report(schedule, run, report, scan))
        run.delivery_summary = delivery_summary
        if delivery_summary.get("outcome") == "unconfirmed":
            run.error_message = "Delivery outcome unconfirmed; check the receiving channel"
        else:
            confirmed = delivery_summary.get("success") is True
            run.status = ReportScheduleRunStatus.COMPLETED if confirmed else ReportScheduleRunStatus.FAILED
            run.error_message = None if confirmed else "Delivery failed"
            run.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {"run_id": run_id, "report_id": str(report.id), "status": run.status.value}


def _fail_run(db: Session, run: ReportScheduleRun, message: str) -> None:
    run.status = ReportScheduleRunStatus.FAILED
    run.error_message = message[:REPORT_RUN_ERROR_LIMIT]
    run.completed_at = datetime.now(timezone.utc)
    db.commit()
