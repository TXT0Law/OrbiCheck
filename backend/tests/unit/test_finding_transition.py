"""Notification candidates require a comparable evidence-backed baseline."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanModuleResult, ScanStatus
from app.services.finding_identity import FINDING_RULESET_VERSION
from app.services.finding_transition import classify_high_risk_transitions

BASE_TIME = datetime(2026, 11, 1, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"


def _scan(
    minute: int,
    *,
    modules: dict[str, dict | None],
    findings: list[tuple[str, str, list[str]]] | None = None,
    user_id: int = 7,
    domain: str = "example.com",
    ruleset_version: int | None = FINDING_RULESET_VERSION,
    projected: bool = True,
    status: ScanStatus = ScanStatus.COMPLETED,
) -> Scan:
    completed_at = BASE_TIME + timedelta(minutes=minute)
    scan = Scan(
        id=uuid4(),
        user_id=user_id,
        domain=domain,
        url=f"https://{domain}",
        status=status,
        completed_at=completed_at,
        finding_observations_projected_at=completed_at if projected else None,
        finding_ruleset_version=ruleset_version,
    )
    scan.module_results = [
        ScanModuleResult(
            module_name=name,
            status=ModuleStatus.SUCCESS if raw is not None else ModuleStatus.FAILED,
            raw_result=raw,
        )
        for name, raw in modules.items()
    ]
    scan.finding_observations = [
        ScanFindingObservation(
            rule_id=rule_id,
            ruleset_version=ruleset_version or FINDING_RULESET_VERSION,
            severity=severity,
            title="Risk",
            description="Evidence-backed risk",
            evidence_modules=evidence_modules,
            observed_at=completed_at,
        )
        for rule_id, severity, evidence_modules in findings or []
    ]
    return scan


@pytest.mark.unit
def test_first_observation_is_a_baseline_and_does_not_alert() -> None:
    current = _scan(1, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])])

    assert classify_high_risk_transitions(current, []) == []


@pytest.mark.unit
def test_new_high_risk_requires_prior_successful_absence() -> None:
    clean = _scan(1, modules={"ssl": {}})
    current = _scan(2, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])])

    transitions = classify_high_risk_transitions(current, [clean])

    assert [(item.rule_id, item.kind) for item in transitions] == [(RULE_ID, "new")]
    assert transitions[0].scan_id == current.id


@pytest.mark.unit
def test_returning_risk_is_regressed_but_continuing_risk_is_suppressed() -> None:
    earlier_risk = _scan(1, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])])
    clean = _scan(2, modules={"ssl": {}})
    current = _scan(3, modules={"ssl": {}}, findings=[(RULE_ID, "critical", ["ssl"])])

    assert [(item.rule_id, item.kind) for item in classify_high_risk_transitions(current, [earlier_risk, clean])] == [
        (RULE_ID, "regressed")
    ]
    assert classify_high_risk_transitions(current, [earlier_risk]) == []


@pytest.mark.unit
def test_failed_scan_between_risk_observations_does_not_count_as_resolution() -> None:
    earlier_risk = _scan(1, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])])
    failed_gap = _scan(2, modules={"ssl": None})
    current = _scan(3, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])])

    assert classify_high_risk_transitions(current, [earlier_risk, failed_gap]) == []


@pytest.mark.unit
@pytest.mark.parametrize(
    "previous",
    [
        _scan(1, modules={"ssl": None}),
        _scan(1, modules={"ssl": {"skipped": True}}),
        _scan(1, modules={"ssl": {}}, projected=False),
        _scan(1, modules={"ssl": {}}, ruleset_version=None),
        _scan(1, modules={"ssl": {}}, user_id=8),
        _scan(1, modules={"ssl": {}}, domain="other.example"),
        _scan(1, modules={"ssl": {}}, status=ScanStatus.FAILED),
    ],
)
def test_missing_or_incompatible_history_cannot_prove_a_new_risk(previous: Scan) -> None:
    current = _scan(2, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])])

    assert classify_high_risk_transitions(current, [previous]) == []


@pytest.mark.unit
def test_multi_source_rule_compares_only_modules_supporting_current_finding() -> None:
    rule_id = "headers.missing_csp"
    current = _scan(
        2,
        modules={"headers": {}, "http-security": {}},
        findings=[(rule_id, "high", ["http-security"])],
    )
    unrelated_coverage = _scan(1, modules={"headers": {}})
    matching_coverage = _scan(1, modules={"http-security": {}})

    assert classify_high_risk_transitions(current, [unrelated_coverage]) == []
    assert [(item.rule_id, item.kind) for item in classify_high_risk_transitions(current, [matching_coverage])] == [
        (rule_id, "new")
    ]


@pytest.mark.unit
def test_low_risk_and_unprojected_current_scans_do_not_create_candidates() -> None:
    clean = _scan(1, modules={"ssl": {}})
    low_risk = _scan(2, modules={"ssl": {}}, findings=[(RULE_ID, "low", ["ssl"])])
    unprojected = _scan(2, modules={"ssl": {}}, findings=[(RULE_ID, "high", ["ssl"])], projected=False)

    assert classify_high_risk_transitions(low_risk, [clean]) == []
    assert classify_high_risk_transitions(unprojected, [clean]) == []


@pytest.mark.unit
def test_current_finding_without_successful_support_is_not_notifiable() -> None:
    clean = _scan(1, modules={"ssl": {}})
    unsupported = _scan(2, modules={"ssl": None}, findings=[(RULE_ID, "high", ["ssl"])])

    assert classify_high_risk_transitions(unsupported, [clean]) == []
