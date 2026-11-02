"""Report presentation never hides uncertain or truncated risk evidence."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.services.finding_report_period import (
    ReportRiskPeriodScans,
    ReportRiskProjectionCoverage,
    ReportRiskWindow,
)
from app.services.finding_report_presentation import present_report_risk_period
from app.services.finding_report_sequence import (
    ReportRiskPeriodChanges,
    ReportRiskTransition,
)
from app.services.finding_report_summary import ScheduledReportRiskSummary

END_AT = datetime(2026, 11, 2, tzinfo=timezone.utc)


def _summary(
    *,
    scanned: int,
    truncated: bool,
    unknown: bool,
    changes: tuple[ReportRiskTransition, ...] = (),
) -> ScheduledReportRiskSummary:
    return ScheduledReportRiskSummary(
        window=ReportRiskWindow(END_AT - timedelta(days=7), END_AT),
        period=ReportRiskPeriodScans(scans=[], has_more=truncated),
        projection=ReportRiskProjectionCoverage(
            scanned=scanned,
            projected=scanned,
            pending=0,
            failed=0,
            unusable_ruleset_version=0,
            unavailable=0,
            truncated=truncated,
        ),
        changes=ReportRiskPeriodChanges(changes, has_unknown_coverage=unknown),
    )


@pytest.mark.unit
def test_presentation_counts_adjacent_transitions_without_calling_them_unique_risks() -> None:
    first, second, third = uuid4(), uuid4(), uuid4()
    changes = (
        ReportRiskTransition(first, second, "ssl.expiry", "new"),
        ReportRiskTransition(second, third, "ssl.expiry", "continuing"),
        ReportRiskTransition(second, third, "headers.csp", "resolved"),
        ReportRiskTransition(second, third, "dns.dnssec", "unknown"),
    )

    view = present_report_risk_period(
        _summary(scanned=2, truncated=False, unknown=True, changes=changes)
    )

    assert view.start_at == "2026-10-26T00:00:00+00:00"
    assert view.end_at == END_AT.isoformat()
    assert view.change_counts == {
        "new": 1,
        "continuing": 1,
        "resolved": 1,
        "unknown": 1,
    }
    assert view.has_unknown_coverage is True


@pytest.mark.unit
def test_presentation_exposes_zero_scans_and_truncation_as_unknown() -> None:
    empty = present_report_risk_period(
        _summary(scanned=0, truncated=False, unknown=False)
    )
    truncated = present_report_risk_period(
        _summary(scanned=50, truncated=True, unknown=False)
    )

    assert empty.scanned == 0
    assert empty.has_unknown_coverage is True
    assert truncated.truncated is True
    assert truncated.has_unknown_coverage is True
    assert all(count == 0 for count in empty.change_counts.values())
