import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.report_schedule import (
    ReportScheduleCreateRequest,
    ReportScheduleListResponse,
    ReportScheduleResponse,
    ReportScheduleRunsResponse,
    ReportScheduleUpdateRequest,
)
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user, get_db
from app.services import report_schedule_service
from app.tasks.report_schedule_tasks import generate_scheduled_report_run

router = APIRouter(prefix="/report-schedules", tags=["report-schedules"])


@router.get("", response_model=SuccessResponse[ReportScheduleListResponse])
async def list_report_schedules(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[ReportScheduleListResponse]:
    schedules = await report_schedule_service.list_schedules(db, current_user.id)
    return SuccessResponse(data=ReportScheduleListResponse(schedules=schedules))


@router.post("", status_code=201, response_model=SuccessResponse[ReportScheduleResponse])
async def create_report_schedule(
    request: ReportScheduleCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[ReportScheduleResponse]:
    schedule = await report_schedule_service.create_schedule(db, current_user.id, request)
    await db.commit()
    await db.refresh(schedule)
    response = await report_schedule_service.get_schedule_response(db, schedule.id, current_user.id)
    return SuccessResponse(data=response)


@router.get("/{schedule_id}", response_model=SuccessResponse[ReportScheduleResponse])
async def get_report_schedule(
    schedule_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[ReportScheduleResponse]:
    schedule = await report_schedule_service.get_schedule_response(db, schedule_id, current_user.id)
    return SuccessResponse(data=schedule)


@router.put("/{schedule_id}", response_model=SuccessResponse[ReportScheduleResponse])
async def update_report_schedule(
    schedule_id: uuid.UUID,
    request: ReportScheduleUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[ReportScheduleResponse]:
    schedule = await report_schedule_service.update_schedule(
        db,
        schedule_id,
        current_user.id,
        request,
    )
    await db.commit()
    response = await report_schedule_service.get_schedule_response(db, schedule.id, current_user.id)
    return SuccessResponse(data=response)


@router.delete("/{schedule_id}", response_model=SuccessResponse[dict])
async def delete_report_schedule(
    schedule_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[dict]:
    await report_schedule_service.delete_schedule(db, schedule_id, current_user.id)
    await db.commit()
    return SuccessResponse(data={})


@router.post("/{schedule_id}/run-now", response_model=SuccessResponse[dict])
async def run_report_schedule_now(
    schedule_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[dict]:
    run = await report_schedule_service.create_schedule_run(db, schedule_id, current_user.id)
    await db.commit()
    if settings.APP_ENV.lower() == "development":
        background_tasks.add_task(generate_scheduled_report_run.run, str(run.id))
    else:
        generate_scheduled_report_run.delay(str(run.id))
    return SuccessResponse(data={"runId": str(run.id)})


@router.get("/{schedule_id}/runs", response_model=SuccessResponse[ReportScheduleRunsResponse])
async def list_report_schedule_runs(
    schedule_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse[ReportScheduleRunsResponse]:
    runs = await report_schedule_service.list_schedule_runs(db, schedule_id, current_user.id)
    return SuccessResponse(data=ReportScheduleRunsResponse(runs=runs))
