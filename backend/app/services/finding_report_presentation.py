"""Bounded, format-neutral facts for a scheduled report's risk section."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.finding_report_changes import ReportRuleChange
from app.services.finding_report_summary import ScheduledReportRiskSummary

REPORT_RISK_CHANGE_ORDER: tuple[ReportRuleChange, ...] = (
    "new",
    "continuing",
    "resolved",
    "unknown",
)


@dataclass(frozen=True, slots=True)
class ReportRiskPeriodPresentation:
    start_at: str
    end_at: str
    scanned: int
    projected: int
    pending: int
    failed: int
    unusable_ruleset_version: int
    unavailable: int
    truncated: bool
    has_unknown_coverage: bool
    change_counts: dict[ReportRuleChange, int]


def present_report_risk_period(
    summary: ScheduledReportRiskSummary,
) -> ReportRiskPeriodPresentation:
    """Count evidenced adjacent-scan transitions without implying full coverage.

    These are transition counts, not distinct risks or a current-risk total.
    Zero scans, truncation, and projection gaps remain explicit in every report
    format that later consumes this presentation model.
    """
    counts: dict[ReportRuleChange, int] = {
        change: 0 for change in REPORT_RISK_CHANGE_ORDER
    }
    for transition in summary.changes.transitions:
        counts[transition.change] += 1
    projection = summary.projection
    return ReportRiskPeriodPresentation(
        start_at=summary.window.start_at.isoformat(),
        end_at=summary.window.end_at.isoformat(),
        scanned=projection.scanned,
        projected=projection.projected,
        pending=projection.pending,
        failed=projection.failed,
        unusable_ruleset_version=projection.unusable_ruleset_version,
        unavailable=projection.unavailable,
        truncated=projection.truncated or summary.period.has_more,
        has_unknown_coverage=(
            summary.changes.has_unknown_coverage
            or projection.truncated
            or summary.period.has_more
            or projection.scanned == 0
            or projection.pending > 0
            or projection.failed > 0
            or projection.unusable_ruleset_version > 0
            or projection.unavailable > 0
        ),
        change_counts=counts,
    )
