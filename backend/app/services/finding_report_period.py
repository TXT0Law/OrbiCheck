"""Bounded scan coverage for a scheduled report's risk period."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.report_schedule import ReportScheduleCadence
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
    This window is a fallback; later reports should start at the previous
    successfully delivered report's completion time.
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
