import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.core.celery_app import celery_app
from app.core.redis import get_redis_sync
from app.models.report import Report, ReportStatus
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
            content_md, content_pdf, report_meta = generate_report_artifacts_sync(db, report)

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
            )
            db.execute(
                update(Report)
                .where(Report.id == report.id)
                .values(
                    status=ReportStatus.COMPLETED,
                    content_md=content_md,
                    content_pdf=content_pdf,
                    report_meta=report_meta,
                    file_size_bytes=file_size,
                    completed_at=datetime.now(timezone.utc),
                    error_message=None,
                )
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
            db.execute(
                update(Report)
                .where(Report.id == uuid.UUID(report_id))
                .values(
                    status=ReportStatus.FAILED,
                    error_message=str(exc),
                    completed_at=datetime.now(timezone.utc),
                )
            )
            db.commit()
        return {"report_id": report_id, "status": ReportStatus.FAILED.value}
    finally:
        redis.close()
