"""Assemble bounded evidence for one scheduled report's risk period."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.report_schedule import ReportScheduleCadence
from app.services.finding_report_evidence import (
    ReportRiskModulesPage,
    ReportRiskObservationsPage,
    load_report_risk_observations,
    load_report_risk_successful_modules,
)
from app.services.finding_report_period import (
    ReportRiskPeriodScans,
    ReportRiskProjectionCoverage,
    ReportRiskWindow,
    load_report_risk_period_predecessor,
    load_report_risk_period_scans,
    resolve_scheduled_report_risk_window,
    summarize_report_risk_projection_coverage,
)
from app.services.finding_report_sequence import (
    ReportRiskPeriodChanges,
    classify_report_risk_period,
)


@dataclass(frozen=True, slots=True)
class ScheduledReportRiskSummary:
    window: ReportRiskWindow
    period: ReportRiskPeriodScans
    projection: ReportRiskProjectionCoverage
    changes: ReportRiskPeriodChanges


def load_scheduled_report_risk_summary(
    db: Session,
    *,
    user_id: int,
    schedule_id: uuid.UUID,
    domain: str,
    cadence: ReportScheduleCadence,
    timezone_name: str,
    end_at: datetime,
) -> ScheduledReportRiskSummary:
    """Load narrow evidence and classify without concealing an incomplete period.

    The caller supplies the actual generation time after any fresh scan. This
    reads bounded scans, observations, and successful module names; it neither
    renders report content nor advances the delivered-period boundary.
    """
    window = resolve_scheduled_report_risk_window(
        db,
        user_id=user_id,
        schedule_id=schedule_id,
        domain=domain,
        cadence=cadence,
        timezone_name=timezone_name,
        end_at=end_at,
    )
    period = load_report_risk_period_scans(
        db,
        user_id=user_id,
        domain=domain,
        start_at=window.start_at,
        end_at=window.end_at,
    )
    predecessor = load_report_risk_period_predecessor(
        db, user_id=user_id, domain=domain, start_at=window.start_at
    )
    scan_ids = tuple(
        scan.id
        for scan in ([predecessor] if predecessor is not None else []) + period.scans
    )
    if scan_ids:
        observations = load_report_risk_observations(
            db, user_id=user_id, domain=domain, scan_ids=scan_ids
        )
        modules = load_report_risk_successful_modules(
            db, user_id=user_id, domain=domain, scan_ids=scan_ids
        )
    else:
        observations = ReportRiskObservationsPage(
            observations=[], has_more=False, oversized_evidence=False
        )
        modules = ReportRiskModulesPage(successful_modules={}, has_more=False)
    changes = classify_report_risk_period(
        user_id=user_id,
        domain=domain,
        predecessor=predecessor,
        period=period,
        observations=observations,
        modules=modules,
    )
    return ScheduledReportRiskSummary(
        window=window,
        period=period,
        projection=summarize_report_risk_projection_coverage(period),
        changes=changes,
    )
