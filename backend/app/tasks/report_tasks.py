import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.core.celery_app import celery_app
from app.core.redis import get_redis_sync
from app.models.report import Report, ReportStatus
from app.services.operational_event_service import record_event_sync
from app.services.report_service import generate_report_artifacts_sync
from app.tasks.scan_tasks import _get_sync_session

logger = logging.getLogger(__name__)


@celery_app.task(name="generate_report", bind=True, max_retries=1)
def generate_report(self, report_id: str) -> dict:
    """Generate report artifacts and persist them on the Report row."""
    redis = get_redis_sync()
    progress_key = f"report:{report_id}:progress"

    try:
        with _get_sync_session() as db:
            report = db.execute(
                select(Report).where(Report.id == uuid.UUID(report_id))
            ).scalar_one_or_none()
            if report is None:
                return {"report_id": report_id, "status": "not_found"}

            db.execute(
                update(Report)
                .where(Report.id == report.id)
                .values(
                    status=ReportStatus.GENERATING,
                    error_message=None,
                    celery_task_id=self.request.id,
                )
            )
            record_event_sync(
                db,
                event_type="report.generation.started",
                status="started",
                user_id=report.user_id,
                target_url=(report.report_meta or {}).get("scanUrl"),
                scan_id=report.scan_id,
                monitor_id=report.monitor_id,
                report_id=report.id,
                trace_id=str(report.id),
                details={"taskId": self.request.id},
            )
            db.commit()
            redis.set(
                progress_key,
                json.dumps(
                    {
                        "progress": 15,
                        "phase": "collecting",
                        "detail": "Collecting scan and monitor data",
                    }
                ),
            )

            report = db.execute(
                select(Report).where(Report.id == uuid.UUID(report_id))
            ).scalar_one()
            (
                content_md,
                content_pdf,
                content_html,
                report_meta,
            ) = generate_report_artifacts_sync(db, report)

            redis.set(
                progress_key,
                json.dumps(
                    {
                        "progress": 85,
                        "phase": "rendering",
                        "detail": "Rendering report output",
                    }
                ),
            )

            file_size = len(content_md.encode("utf-8")) + (
                len(content_pdf) if content_pdf else 0
            ) + (
                len(content_html.encode("utf-8")) if content_html else 0
            )
            db.execute(
                update(Report)
                .where(Report.id == report.id)
                .values(
                    status=ReportStatus.COMPLETED,
                    content_md=content_md,
                    content_pdf=content_pdf,
                    content_html=content_html,
                    report_meta=report_meta,
                    file_size_bytes=file_size,
                    completed_at=datetime.now(timezone.utc),
                    error_message=None,
                )
            )
            record_event_sync(
                db,
                event_type="report.generated",
                status="succeeded",
                user_id=report.user_id,
                target_url=(report.report_meta or {}).get("scanUrl"),
                scan_id=report.scan_id,
                monitor_id=report.monitor_id,
                report_id=report.id,
                duration_ms=None,
                trace_id=str(report.id),
                details={
                    "fileSizeBytes": file_size,
                    "format": report.format.value,
                },
            )
            db.commit()

            redis.set(
                progress_key,
                json.dumps(
                    {
                        "progress": 100,
                        "phase": "done",
                        "detail": "Report generation completed",
                        "done": True,
                    }
                ),
            )
            redis.expire(progress_key, 3600)
            return {"report_id": report_id, "status": ReportStatus.COMPLETED.value}
    except Exception as exc:  # noqa: BLE001
        logger.exception("generate_report failed: report_id=%s", report_id)
        redis.set(
            progress_key,
            json.dumps(
                {
                    "progress": 0,
                    "phase": "error",
                    "detail": "Report generation failed",
                    "error": True,
                }
            ),
        )
        redis.expire(progress_key, 3600)
        with _get_sync_session() as db:
            failed_report = db.execute(
                select(Report).where(Report.id == uuid.UUID(report_id))
            ).scalar_one_or_none()
            db.execute(
                update(Report)
                .where(Report.id == uuid.UUID(report_id))
                .values(
                    status=ReportStatus.FAILED,
                    error_message=str(exc),
                    completed_at=datetime.now(timezone.utc),
                )
            )
            if failed_report is not None:
                record_event_sync(
                    db,
                    event_type="report.failed",
                    status="failed",
                    user_id=failed_report.user_id,
                    target_url=(failed_report.report_meta or {}).get("scanUrl"),
                    scan_id=failed_report.scan_id,
                    monitor_id=failed_report.monitor_id,
                    report_id=failed_report.id,
                    error_code="REPORT_GENERATION_FAILED",
                    message=str(exc),
                    trace_id=str(failed_report.id),
                )
            db.commit()
        return {"report_id": report_id, "status": ReportStatus.FAILED.value}
    finally:
        redis.close()
