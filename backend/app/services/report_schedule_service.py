from __future__ import annotations

import calendar
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import aiosmtplib
import httpx
import redis as redis_sync
import structlog
from redis.exceptions import RedisError
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from app.api.v1.schemas.report_schedule import (
    ReportScheduleCreateRequest,
    ReportScheduleResponse,
    ReportScheduleRunResponse,
    ReportScheduleUpdateRequest,
)
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.monitor import Monitor
from app.models.report import Report, ReportFormat
from app.models.report_schedule import (
    ReportSchedule,
    ReportScheduleCadence,
    ReportScheduleRun,
    ReportScheduleRunStatus,
)
from app.models.scan import Scan, ScanStatus
from app.services import email_service
from app.services.notification_channels._helpers import post_json
from app.services.notification_channels.slack import validate_target_url

logger = structlog.get_logger(__name__)

RECENT_RUN_LIMIT = 5
LIST_RUN_LIMIT = 50
DISPATCH_BATCH_LIMIT = 25
MONTHLY_LOOKAHEAD_MONTHS = 24
WEEKLY_LOOKAHEAD_DAYS = 14
REPORT_LINK_FALLBACK = "/dashboard/reports"
SLACK_TEXT_LIMIT = 280
NOTIFICATION_SETTINGS_KEY_PREFIX = "orbicheck:user"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware_utc(value: datetime | None) -> datetime:
    if value is None:
        return _utc_now()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _public_origin() -> str:
    base = (settings.PUBLIC_BASE_URL or "").strip().rstrip("/")
    if base:
        return base
    if settings.CORS_ORIGINS:
        first = str(settings.CORS_ORIGINS[0]).strip().rstrip("/")
        if first.startswith("http"):
            return first
    return ""


def _report_link(report_id: uuid.UUID | None) -> str:
    origin = _public_origin()
    suffix = f"/dashboard/reports/{report_id}" if report_id else REPORT_LINK_FALLBACK
    return f"{origin}{suffix}" if origin else suffix


def compute_next_run_at(
    *,
    cadence: ReportScheduleCadence | str,
    timezone_name: str,
    day_of_week: int | None,
    day_of_month: int | None,
    hour: int,
    minute: int,
    after: datetime | None = None,
) -> datetime:
    """Return the next UTC execution time.

    Monthly schedules use the last day of a shorter month when needed.
    """

    base_utc = _as_aware_utc(after)
    tz = ZoneInfo(timezone_name)
    local_after = base_utc.astimezone(tz)
    cadence_value = cadence.value if isinstance(cadence, ReportScheduleCadence) else cadence

    if cadence_value == ReportScheduleCadence.WEEKLY.value:
        if day_of_week is None:
            raise ValidationError(code="SCHEDULE_INVALID", message="dayOfWeek is required")
        for offset in range(WEEKLY_LOOKAHEAD_DAYS):
            candidate_date = local_after.date() + timedelta(days=offset)
            if candidate_date.weekday() != day_of_week:
                continue
            candidate = datetime(
                candidate_date.year,
                candidate_date.month,
                candidate_date.day,
                hour,
                minute,
                tzinfo=tz,
            )
            if candidate > local_after:
                return candidate.astimezone(timezone.utc)

    if cadence_value == ReportScheduleCadence.MONTHLY.value:
        if day_of_month is None:
            raise ValidationError(code="SCHEDULE_INVALID", message="dayOfMonth is required")
        year = local_after.year
        month = local_after.month
        for _ in range(MONTHLY_LOOKAHEAD_MONTHS):
            last_day = calendar.monthrange(year, month)[1]
            candidate_day = min(day_of_month, last_day)
            candidate = datetime(year, month, candidate_day, hour, minute, tzinfo=tz)
            if candidate > local_after:
                return candidate.astimezone(timezone.utc)
            month += 1
            if month > 12:
                month = 1
                year += 1

    raise ValidationError(code="SCHEDULE_INVALID", message="Invalid schedule cadence")


async def _validate_target(
    db: AsyncSession,
    user_id: int,
    scan_id: uuid.UUID,
    monitor_id: uuid.UUID | None,
) -> None:
    scan = await db.get(Scan, scan_id)
    if scan is None or scan.user_id != user_id:
        raise NotFoundError(code="SCAN_NOT_FOUND", message="Scan not found")
    if scan.status != ScanStatus.COMPLETED:
        raise ValidationError(
            code="SCAN_NOT_READY",
            message="Scheduled reports require a completed scan",
        )
    if monitor_id is None:
        return
    monitor = await db.get(Monitor, monitor_id)
    if monitor is None or monitor.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")


def _validate_delivery(channels: list[str], recipients: list[str]) -> None:
    if "email" in channels and not recipients:
        raise ValidationError(
            code="EMAIL_RECIPIENTS_REQUIRED",
            message="Email recipients are required when email delivery is enabled",
        )


def _schedule_to_response(schedule: ReportSchedule) -> ReportScheduleResponse:
    recent_runs = [
        ReportScheduleRunResponse.model_validate(run)
        for run in list(schedule.runs or [])[:RECENT_RUN_LIMIT]
    ]
    response = ReportScheduleResponse.model_validate(schedule)
    return response.model_copy(update={"recent_runs": recent_runs})


async def create_schedule(
    db: AsyncSession,
    user_id: int,
    request: ReportScheduleCreateRequest,
) -> ReportSchedule:
    await _validate_target(db, user_id, request.scan_id, request.monitor_id)
    _validate_delivery(request.delivery_channels, request.email_recipients)

    next_run_at = (
        compute_next_run_at(
            cadence=request.cadence,
            timezone_name=request.timezone,
            day_of_week=request.day_of_week,
            day_of_month=request.day_of_month,
            hour=request.hour,
            minute=request.minute,
        )
        if request.is_enabled
        else None
    )
    schedule = ReportSchedule(
        user_id=user_id,
        name=request.name.strip(),
        scan_id=request.scan_id,
        monitor_id=request.monitor_id,
        monitor_period=request.monitor_period,
        format=ReportFormat(request.format),
        cadence=ReportScheduleCadence(request.cadence),
        timezone=request.timezone,
        day_of_week=request.day_of_week if request.cadence == "weekly" else None,
        day_of_month=request.day_of_month if request.cadence == "monthly" else None,
        hour=request.hour,
        minute=request.minute,
        delivery_channels=request.delivery_channels,
        email_recipients=request.email_recipients,
        is_enabled=request.is_enabled,
        next_run_at=next_run_at,
    )
    db.add(schedule)
    await db.flush()
    return schedule


async def list_schedules(db: AsyncSession, user_id: int) -> list[ReportScheduleResponse]:
    rows = list(
        (
            await db.execute(
                select(ReportSchedule)
                .options(selectinload(ReportSchedule.runs))
                .where(ReportSchedule.user_id == user_id)
                .order_by(ReportSchedule.created_at.desc())
            )
        ).scalars()
    )
    return [_schedule_to_response(row) for row in rows]


async def get_schedule(db: AsyncSession, schedule_id: uuid.UUID, user_id: int) -> ReportSchedule:
    schedule = (
        await db.execute(
            select(ReportSchedule)
            .options(selectinload(ReportSchedule.runs))
            .where(ReportSchedule.id == schedule_id, ReportSchedule.user_id == user_id)
        )
    ).scalar_one_or_none()
    if schedule is None:
        raise NotFoundError(code="REPORT_SCHEDULE_NOT_FOUND", message="Report schedule not found")
    return schedule


async def get_schedule_response(
    db: AsyncSession,
    schedule_id: uuid.UUID,
    user_id: int,
) -> ReportScheduleResponse:
    return _schedule_to_response(await get_schedule(db, schedule_id, user_id))


async def update_schedule(
    db: AsyncSession,
    schedule_id: uuid.UUID,
    user_id: int,
    request: ReportScheduleUpdateRequest,
) -> ReportSchedule:
    schedule = await get_schedule(db, schedule_id, user_id)
    patch = request.model_dump(exclude_unset=True)

    scan_id = patch.get("scan_id", schedule.scan_id)
    monitor_id = patch.get("monitor_id", schedule.monitor_id)
    if scan_id is None:
        raise ValidationError(code="SCAN_REQUIRED", message="scanId is required")
    await _validate_target(db, user_id, scan_id, monitor_id)

    channels = patch.get("delivery_channels", schedule.delivery_channels)
    recipients = patch.get("email_recipients", schedule.email_recipients)
    _validate_delivery(channels, recipients)

    cadence = ReportScheduleCadence(patch.get("cadence", schedule.cadence.value))
    day_of_week = patch.get("day_of_week", schedule.day_of_week)
    day_of_month = patch.get("day_of_month", schedule.day_of_month)

    if cadence == ReportScheduleCadence.WEEKLY and day_of_week is None:
        raise ValidationError(code="SCHEDULE_INVALID", message="dayOfWeek is required")
    if cadence == ReportScheduleCadence.MONTHLY and day_of_month is None:
        raise ValidationError(code="SCHEDULE_INVALID", message="dayOfMonth is required")

    for key, value in patch.items():
        if key == "format" and value is not None:
            setattr(schedule, key, ReportFormat(value))
        elif key == "cadence" and value is not None:
            setattr(schedule, key, ReportScheduleCadence(value))
        elif key == "name" and value is not None:
            setattr(schedule, key, value.strip())
        else:
            setattr(schedule, key, value)

    if cadence == ReportScheduleCadence.WEEKLY:
        schedule.day_of_month = None
    else:
        schedule.day_of_week = None

    schedule.next_run_at = (
        compute_next_run_at(
            cadence=schedule.cadence,
            timezone_name=schedule.timezone,
            day_of_week=schedule.day_of_week,
            day_of_month=schedule.day_of_month,
            hour=schedule.hour,
            minute=schedule.minute,
        )
        if schedule.is_enabled
        else None
    )
    await db.flush()
    return schedule


async def delete_schedule(db: AsyncSession, schedule_id: uuid.UUID, user_id: int) -> None:
    schedule = await get_schedule(db, schedule_id, user_id)
    await db.delete(schedule)


async def create_schedule_run(
    db: AsyncSession,
    schedule_id: uuid.UUID,
    user_id: int,
) -> ReportScheduleRun:
    schedule = await get_schedule(db, schedule_id, user_id)
    if schedule.scan_id is None:
        raise ValidationError(code="SCHEDULE_TARGET_MISSING", message="Schedule scan is missing")
    run = ReportScheduleRun(
        schedule_id=schedule.id,
        status=ReportScheduleRunStatus.PENDING,
    )
    db.add(run)
    await db.flush()
    return run


async def list_schedule_runs(
    db: AsyncSession,
    schedule_id: uuid.UUID,
    user_id: int,
) -> list[ReportScheduleRunResponse]:
    await get_schedule(db, schedule_id, user_id)
    rows = list(
        (
            await db.execute(
                select(ReportScheduleRun)
                .where(ReportScheduleRun.schedule_id == schedule_id)
                .order_by(ReportScheduleRun.started_at.desc().nullslast())
                .limit(LIST_RUN_LIMIT)
            )
        ).scalars()
    )
    return [ReportScheduleRunResponse.model_validate(row) for row in rows]


def build_due_schedule_query(now: datetime) -> Select[tuple[ReportSchedule]]:
    return (
        select(ReportSchedule)
        .where(
            ReportSchedule.is_enabled.is_(True),
            ReportSchedule.next_run_at.is_not(None),
            ReportSchedule.next_run_at <= now,
        )
        .order_by(ReportSchedule.next_run_at.asc())
        .limit(DISPATCH_BATCH_LIMIT)
        .with_for_update(skip_locked=True)
    )


def dispatch_due_schedules_sync(db: Session, now: datetime | None = None) -> list[ReportScheduleRun]:
    checked_at = now or _utc_now()
    schedules = list(db.scalars(build_due_schedule_query(checked_at)).all())
    runs: list[ReportScheduleRun] = []
    for schedule in schedules:
        run = ReportScheduleRun(
            schedule_id=schedule.id,
            status=ReportScheduleRunStatus.PENDING,
        )
        db.add(run)
        schedule.last_run_at = checked_at
        schedule.next_run_at = compute_next_run_at(
            cadence=schedule.cadence,
            timezone_name=schedule.timezone,
            day_of_week=schedule.day_of_week,
            day_of_month=schedule.day_of_month,
            hour=schedule.hour,
            minute=schedule.minute,
            after=checked_at,
        )
        runs.append(run)
    db.flush()
    return runs


def _notification_settings_key(user_id: int) -> str:
    return f"{NOTIFICATION_SETTINGS_KEY_PREFIX}:{user_id}:notification_settings"


def _resolve_slack_target(user_id: int) -> str | None:
    client = redis_sync.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = client.get(_notification_settings_key(user_id))
        if not raw:
            return None
        parsed = json.loads(raw)
    except (RedisError, json.JSONDecodeError, TypeError):
        return None
    finally:
        client.close()
    if not isinstance(parsed, dict):
        return None
    channels = parsed.get("channels")
    if not isinstance(channels, dict):
        return None
    slack = channels.get("slack")
    if not isinstance(slack, dict) or not slack.get("enabled"):
        return None
    target = slack.get("target")
    return target.strip() if isinstance(target, str) and target.strip() else None


def _build_slack_payload(schedule: ReportSchedule, report: Report, scan: Scan) -> dict[str, Any]:
    link = _report_link(report.id)
    score = (report.report_meta or {}).get("securityScore")
    fields = [
        {"type": "mrkdwn", "text": f"*Target*\n{scan.domain}"},
        {"type": "mrkdwn", "text": f"*Format*\n{report.format.value}"},
    ]
    if isinstance(score, int):
        fields.append({"type": "mrkdwn", "text": f"*Score*\n{score}"})
    return {
        "text": f"Scheduled report ready: {report.title}"[:SLACK_TEXT_LIMIT],
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "Scheduled report ready"},
            },
            {"type": "section", "text": {"type": "mrkdwn", "text": report.title}},
            {"type": "section", "fields": fields},
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "style": "primary",
                        "text": {"type": "plain_text", "text": "Open report"},
                        "url": link,
                    }
                ],
            },
        ],
    }


async def deliver_scheduled_report(
    schedule: ReportSchedule,
    run: ReportScheduleRun,
    report: Report,
    scan: Scan,
) -> dict[str, Any]:
    summary: dict[str, Any] = {"channels": {}, "reportUrl": _report_link(report.id)}
    if "email" in (schedule.delivery_channels or []):
        email_results: list[dict[str, Any]] = []
        for recipient in schedule.email_recipients or []:
            started = time.perf_counter()
            try:
                sent = await email_service.send_report_email(
                    to_email=recipient,
                    schedule_name=schedule.name,
                    report_title=report.title,
                    target_domain=scan.domain,
                    report_url=_report_link(report.id),
                )
            except (aiosmtplib.SMTPException, OSError) as exc:
                sent = False
                error = f"{exc.__class__.__name__}: {str(exc)[:160]}"
            else:
                error = None if sent else "email_not_sent"
            email_results.append(
                {
                    "recipient": recipient,
                    "success": sent,
                    "error": error,
                    "latencyMs": int((time.perf_counter() - started) * 1000),
                }
            )
        summary["channels"]["email"] = email_results

    if "slack" in (schedule.delivery_channels or []):
        started = time.perf_counter()
        target = _resolve_slack_target(schedule.user_id)
        if not target:
            summary["channels"]["slack"] = {
                "success": False,
                "error": "slack_not_configured",
                "latencyMs": 0,
            }
        else:
            try:
                target = validate_target_url(target)
                await post_json(target, _build_slack_payload(schedule, report, scan))
            except (ValueError, httpx.HTTPError) as exc:
                summary["channels"]["slack"] = {
                    "success": False,
                    "error": f"{exc.__class__.__name__}: {str(exc)[:160]}",
                    "latencyMs": int((time.perf_counter() - started) * 1000),
                }
            else:
                summary["channels"]["slack"] = {
                    "success": True,
                    "error": None,
                    "latencyMs": int((time.perf_counter() - started) * 1000),
                }

    failures = [
        value
        for value in summary["channels"].values()
        if (
            isinstance(value, dict)
            and not value.get("success")
        )
        or (
            isinstance(value, list)
            and any(not item.get("success") for item in value)
        )
    ]
    summary["success"] = not failures
    summary["runId"] = str(run.id)
    return summary
