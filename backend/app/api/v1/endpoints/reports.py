import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.report import (
    ReportCreateRequest,
    ReportListResponse,
    ReportPreviewResponse,
    ReportResponse,
)
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user, get_db
from app.services import report_service
from app.tasks.report_tasks import generate_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", status_code=201, response_model=SuccessResponse[ReportResponse])
async def create_report(
    request: ReportCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    report = await report_service.create_report(db, current_user.id, request)
    await db.commit()
    await db.refresh(report)

    if settings.APP_ENV.lower() == "development":
        background_tasks.add_task(generate_report.run, str(report.id))
    else:
        task = generate_report.delay(str(report.id))
        report.celery_task_id = task.id if task else None
        await db.commit()
        await db.refresh(report)

    return SuccessResponse(data=ReportResponse.model_validate(report))


@router.get("", response_model=SuccessResponse[ReportListResponse])
async def list_reports(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: Literal["pending", "generating", "completed", "failed"] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reports, meta = await report_service.list_reports(
        db,
        current_user.id,
        page=page,
        limit=limit,
        status=status,
    )
    return SuccessResponse(data=ReportListResponse(reports=reports), meta=meta)


@router.get("/{report_id}", response_model=SuccessResponse[ReportResponse])
async def get_report(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    report = await report_service.get_report(db, report_id, current_user.id)
    return SuccessResponse(data=ReportResponse.model_validate(report))


@router.get("/{report_id}/preview", response_model=SuccessResponse[ReportPreviewResponse])
async def get_report_preview(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    preview = await report_service.get_report_preview(db, report_id, current_user.id)
    return SuccessResponse(data=preview)


@router.get("/{report_id}/download")
async def download_report(
    report_id: uuid.UUID,
    format: Literal["pdf", "markdown", "html"] = Query(default="pdf"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body, filename, content_type = await report_service.get_report_download(
        db,
        report_id,
        current_user.id,
        format,
    )
    return Response(
        content=body,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{report_id}", response_model=SuccessResponse[dict])
async def delete_report(
    report_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await report_service.delete_report(db, report_id, current_user.id)
    await db.commit()
    return SuccessResponse(data={})
