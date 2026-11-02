"""Report period transitions never infer repairs across evidence gaps."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.scan import Scan, ScanStatus
from app.services.finding_report_evidence import (
    ReportRiskModulesPage,
    ReportRiskObservation,
    ReportRiskObservationsPage,
)
from app.services.finding_report_period import ReportRiskPeriodScans
from app.services.finding_report_sequence import classify_report_risk_period

BASE_TIME = datetime(2026, 11, 1, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"


def _scan(minute: int, *, status: ScanStatus = ScanStatus.COMPLETED) -> Scan:
    completed_at = BASE_TIME + timedelta(minutes=minute)
    return Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=status,
        completed_at=completed_at,
        finding_observations_projected_at=completed_at
        if status == ScanStatus.COMPLETED
        else None,
        finding_ruleset_version=1,
    )


def _observation(scan: Scan) -> ReportRiskObservation:
    return ReportRiskObservation(
        scan_id=scan.id,
        rule_id=RULE_ID,
        ruleset_version=1,
        severity="high",
        evidence_modules=("ssl",),
    )


def _classify(
    predecessor: Scan | None,
    scans: list[Scan],
    observations: list[ReportRiskObservation],
    *,
    truncated: bool = False,
):
    all_scans = ([predecessor] if predecessor is not None else []) + scans
    return classify_report_risk_period(
        user_id=7,
        domain="example.com",
        predecessor=predecessor,
        period=ReportRiskPeriodScans(scans=scans, has_more=truncated),
        observations=ReportRiskObservationsPage(
            observations=observations, has_more=False, oversized_evidence=False
        ),
        modules=ReportRiskModulesPage(
            successful_modules={scan.id: frozenset({"ssl"}) for scan in all_scans},
            has_more=False,
        ),
    )


@pytest.mark.unit
def test_report_sequence_classifies_adjacent_new_continuing_resolved() -> None:
    predecessor, new, continuing, repaired = (_scan(n) for n in range(4))
    result = _classify(
        predecessor,
        [new, continuing, repaired],
        [_observation(new), _observation(continuing)],
    )

    assert [transition.change for transition in result.transitions] == [
        "new",
        "continuing",
        "resolved",
    ]
    assert result.has_unknown_coverage is False
    assert result.transitions[0].previous_scan_id == predecessor.id
    assert result.transitions[-1].current_scan_id == repaired.id


@pytest.mark.unit
def test_report_sequence_keeps_failed_scan_as_unknown_gap() -> None:
    risky, failed, repaired = _scan(0), _scan(1, status=ScanStatus.FAILED), _scan(2)
    result = _classify(risky, [failed, repaired], [_observation(risky)])

    assert [
        (transition.current_scan_id, transition.change)
        for transition in result.transitions
    ] == [(failed.id, "unknown")]
    assert result.has_unknown_coverage is True


@pytest.mark.unit
def test_report_sequence_marks_missing_baseline_and_truncation_unknown() -> None:
    first, second = _scan(0), _scan(1)
    without_baseline = _classify(None, [first, second], [_observation(first)])
    truncated = _classify(first, [second], [_observation(first)], truncated=True)

    assert [transition.change for transition in without_baseline.transitions] == [
        "unknown",
        "resolved",
    ]
    assert without_baseline.has_unknown_coverage is True
    assert [transition.change for transition in truncated.transitions] == ["unknown"]
    assert truncated.has_unknown_coverage is True


@pytest.mark.unit
def test_report_sequence_marks_no_scans_unknown() -> None:
    result = _classify(None, [], [])

    assert result.transitions == ()
    assert result.has_unknown_coverage is True


@pytest.mark.unit
def test_report_sequence_rejects_out_of_scope_or_unordered_scans() -> None:
    earlier, later = _scan(0), _scan(1)
    later.user_id = 8
    with pytest.raises(ValueError, match="out-of-scope"):
        _classify(earlier, [later], [])

    later.user_id = 7
    with pytest.raises(ValueError, match="unique and ordered"):
        _classify(later, [earlier], [])
    with pytest.raises(ValueError, match="out-of-scope"):
        _classify(earlier, [later], [_observation(_scan(2))])
