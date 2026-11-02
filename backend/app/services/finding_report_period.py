"""Bounded scan coverage for a scheduled report's risk period."""

from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.report import Report, ReportStatus
from app.models.report_schedule import (
    ReportScheduleCadence,
    ReportScheduleRun,
    ReportScheduleRunStatus,
)
from app.models.scan import Scan, ScanStatus

REPORT_RISK_PERIOD_SCAN_LIMIT = 50
REPORT_RISK_PERIOD_SCAN_MAX_LIMIT = 100
WEEKLY_REPORT_RISK_LOOKBACK_DAYS = 7


@dataclass(frozen=True, slots=True)
class ReportRiskWindow:
    start_at: datetime
    end_at: datetime


def first_report_risk_window(
    *, cadence: ReportScheduleCadence, timezone_name: str, end_at: datetime
) -> ReportRiskWindow:
    """Use a local calendar lookback when no earlier successful report exists.

    The end is actual report generation time, after an optional fresh scan.
    This window is a fallback; later reports should start at the content
    generation time of the previous successfully delivered report.
    """
    if end_at.tzinfo is None or end_at.utcoffset() is None:
        raise ValueError("Report risk period end must include a timezone")
    local_end = end_at.astimezone(ZoneInfo(timezone_name))
    if cadence == ReportScheduleCadence.WEEKLY:
        local_start = local_end - timedelta(days=WEEKLY_REPORT_RISK_LOOKBACK_DAYS)
    elif cadence == ReportScheduleCadence.MONTHLY:
        year, month = local_end.year, local_end.month - 1
        if month == 0:
            year, month = year - 1, 12
        day = min(local_end.day, calendar.monthrange(year, month)[1])
        local_start = local_end.replace(year=year, month=month, day=day)
    else:
        raise ValueError("Unsupported report risk period cadence")
    return ReportRiskWindow(
        start_at=local_start.astimezone(timezone.utc),
        end_at=end_at.astimezone(timezone.utc),
    )


@dataclass(frozen=True, slots=True)
class ReportRiskPeriodScans:
    scans: list[Scan]
    has_more: bool


def load_previous_delivered_report_boundary(
    db: Session,
    *,
    user_id: int,
    schedule_id: uuid.UUID,
    domain: str,
    end_at: datetime,
) -> datetime | None:
    """Find the last delivered report's generation time for this target.

    Delivery can finish after generation. Starting at the report's content
    timestamp preserves scans completed while the previous delivery ran.
    Failed runs and reports for a prior schedule target never close a period.
    """
    if user_id <= 0 or not isinstance(schedule_id, uuid.UUID):
        raise ValueError("Report risk period requires an owner and schedule")
    if not domain or domain != domain.strip():
        raise ValueError("Report risk period requires a domain")
    if end_at.tzinfo is None or end_at.utcoffset() is None:
        raise ValueError("Report risk period end must include a timezone")

    query = (
        select(Report.completed_at)
        .join(ReportScheduleRun, ReportScheduleRun.report_id == Report.id)
        .where(
            ReportScheduleRun.schedule_id == schedule_id,
            ReportScheduleRun.status == ReportScheduleRunStatus.COMPLETED,
            ReportScheduleRun.completed_at.is_not(None),
            ReportScheduleRun.completed_at < end_at,
            Report.user_id == user_id,
            Report.status == ReportStatus.COMPLETED,
            Report.completed_at.is_not(None),
            Report.completed_at < end_at,
            Report.report_meta["scanDomain"].astext == domain,
        )
        .order_by(Report.completed_at.desc(), ReportScheduleRun.id.desc())
        .limit(1)
    )
    return db.scalar(query)


def resolve_scheduled_report_risk_window(
    db: Session,
    *,
    user_id: int,
    schedule_id: uuid.UUID,
    domain: str,
    cadence: ReportScheduleCadence,
    timezone_name: str,
    end_at: datetime,
) -> ReportRiskWindow:
    """Cover the time since the last delivered report, or the first lookback.

    The caller supplies actual generation time after any fresh scan. A failed
    or still-delivering run does not advance the start, so delayed runs retain
    their uncovered interval.
    """
    fallback = first_report_risk_window(
        cadence=cadence, timezone_name=timezone_name, end_at=end_at
    )
    previous_end = load_previous_delivered_report_boundary(
        db,
        user_id=user_id,
        schedule_id=schedule_id,
        domain=domain,
        end_at=fallback.end_at,
    )
    if previous_end is None:
        return fallback
    if (
        previous_end.tzinfo is None
        or previous_end.utcoffset() is None
        or previous_end >= fallback.end_at
    ):
        raise ValueError("Previous delivered report has an invalid risk boundary")
    return ReportRiskWindow(
        start_at=previous_end.astimezone(timezone.utc),
        end_at=fallback.end_at,
    )


def load_report_risk_period_scans(
    db: Session,
    *,
    user_id: int,
    domain: str,
    start_at: datetime,
    end_at: datetime,
    limit: int = REPORT_RISK_PERIOD_SCAN_LIMIT,
) -> ReportRiskPeriodScans:
    """Load completed scans in [start, end), including unprojected scans.

    A truncated result cannot prove that a risk was absent or repaired. The
    caller must also inspect each scan's projection and module evidence.
    """
    if user_id <= 0 or not domain or domain != domain.strip():
        raise ValueError("Report risk period requires an owner and domain")
    if not 1 <= limit <= REPORT_RISK_PERIOD_SCAN_MAX_LIMIT:
        raise ValueError("Report risk period scan limit is outside the allowed range")
    if (
        start_at.tzinfo is None
        or start_at.utcoffset() is None
        or end_at.tzinfo is None
        or end_at.utcoffset() is None
        or start_at >= end_at
    ):
        raise ValueError("Report risk period requires an ordered timezone-aware window")

    query = (
        select(Scan)
        .where(
            Scan.user_id == user_id,
            Scan.domain == domain,
            Scan.status == ScanStatus.COMPLETED,
            Scan.completed_at >= start_at,
            Scan.completed_at < end_at,
        )
        .order_by(Scan.completed_at, Scan.id)
        .limit(limit + 1)
    )
    rows = list(db.execute(query).scalars().all())
    return ReportRiskPeriodScans(scans=rows[:limit], has_more=len(rows) > limit)
