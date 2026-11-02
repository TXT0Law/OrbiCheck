"""Report changes require successful evidence for the same stable rule."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.scan import (
    ModuleStatus,
    Scan,
    ScanFindingObservation,
    ScanModuleResult,
    ScanStatus,
)
from app.services.finding_report_changes import (
    classify_report_rule_change,
    classify_report_rule_change_from_evidence,
)
from app.services.finding_report_evidence import ReportRiskObservation

BASE_TIME = datetime(2026, 11, 1, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"


def _scan(
    minute: int,
    *,
    modules: dict[str, dict | None],
    findings: dict[str, list[str]] | None = None,
    user_id: int = 7,
    domain: str = "example.com",
    version: int | None = 1,
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
        finding_ruleset_version=version,
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
            ruleset_version=version or 1,
            severity="high",
            title="Risk",
            description="Evidence-backed risk",
            evidence_modules=evidence_modules,
            observed_at=completed_at,
        )
        for rule_id, evidence_modules in (findings or {}).items()
    ]
    return scan


def _narrow_observations(scan: Scan) -> tuple[ReportRiskObservation, ...]:
    return tuple(
        ReportRiskObservation(
            scan_id=scan.id,
            rule_id=row.rule_id,
            ruleset_version=row.ruleset_version,
            severity=row.severity,
            evidence_modules=tuple(row.evidence_modules),
        )
        for row in scan.finding_observations
    )


@pytest.mark.unit
def test_report_rule_change_requires_a_clean_successful_baseline() -> None:
    clean = _scan(1, modules={"ssl": {}})
    risky = _scan(2, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    later_risky = _scan(3, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    repaired = _scan(4, modules={"ssl": {}})

    assert classify_report_rule_change(clean, risky, rule_id=RULE_ID) == "new"
    assert (
        classify_report_rule_change(risky, later_risky, rule_id=RULE_ID) == "continuing"
    )
    assert (
        classify_report_rule_change(later_risky, repaired, rule_id=RULE_ID)
        == "resolved"
    )
    assert classify_report_rule_change(clean, repaired, rule_id=RULE_ID) == "unknown"


@pytest.mark.unit
@pytest.mark.parametrize(
    "raw",
    [None, {"skipped": True}, {"data": {"note": "Not configured"}}],
)
def test_report_rule_absence_requires_successful_matching_module(
    raw: dict | None,
) -> None:
    risky = _scan(1, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    uncertain = _scan(2, modules={"ssl": raw})
    prior_uncertain = _scan(1, modules={"ssl": raw})
    current_risky = _scan(2, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})

    assert classify_report_rule_change(risky, uncertain, rule_id=RULE_ID) == "unknown"
    assert (
        classify_report_rule_change(prior_uncertain, current_risky, rule_id=RULE_ID)
        == "unknown"
    )


@pytest.mark.unit
def test_report_rule_uses_only_actual_multisource_evidence() -> None:
    rule_id = "headers.missing_csp"
    current = _scan(
        2,
        modules={"headers": {}, "http-security": {}},
        findings={rule_id: ["http-security"]},
    )
    unrelated = _scan(1, modules={"headers": {}})
    matching = _scan(1, modules={"http-security": {}})

    assert classify_report_rule_change(unrelated, current, rule_id=rule_id) == "unknown"
    assert classify_report_rule_change(matching, current, rule_id=rule_id) == "new"


@pytest.mark.unit
def test_report_rule_cannot_resolve_when_one_supporting_module_fails() -> None:
    rule_id = "headers.missing_csp"
    risky = _scan(
        1,
        modules={"headers": {}, "http-security": {}},
        findings={rule_id: ["headers", "http-security"]},
    )
    partial = _scan(2, modules={"headers": {}, "http-security": None})
    complete = _scan(3, modules={"headers": {}, "http-security": {}})

    assert classify_report_rule_change(risky, partial, rule_id=rule_id) == "unknown"
    assert classify_report_rule_change(risky, complete, rule_id=rule_id) == "resolved"
    assert (
        classify_report_rule_change_from_evidence(
            risky,
            partial,
            rule_id=rule_id,
            previous_observations=_narrow_observations(risky),
            current_observations=(),
            previous_successful_modules=frozenset({"headers", "http-security"}),
            current_successful_modules=frozenset({"headers"}),
            evidence_complete=True,
        )
        == "unknown"
    )


@pytest.mark.unit
def test_report_rule_cannot_be_new_when_one_supporting_baseline_module_fails() -> None:
    rule_id = "headers.missing_csp"
    partial = _scan(1, modules={"headers": {}, "http-security": None})
    complete = _scan(1, modules={"headers": {}, "http-security": {}})
    risky = _scan(
        2,
        modules={"headers": {}, "http-security": {}},
        findings={rule_id: ["headers", "http-security"]},
    )

    assert classify_report_rule_change(partial, risky, rule_id=rule_id) == "unknown"
    assert classify_report_rule_change(complete, risky, rule_id=rule_id) == "new"
    assert (
        classify_report_rule_change_from_evidence(
            partial,
            risky,
            rule_id=rule_id,
            previous_observations=(),
            current_observations=_narrow_observations(risky),
            previous_successful_modules=frozenset({"headers"}),
            current_successful_modules=frozenset({"headers", "http-security"}),
            evidence_complete=True,
        )
        == "unknown"
    )


@pytest.mark.unit
def test_report_rule_with_unsupported_observation_is_unknown() -> None:
    clean = _scan(1, modules={"ssl": {}})
    unsupported = _scan(2, modules={"ssl": None}, findings={RULE_ID: ["ssl"]})

    assert classify_report_rule_change(clean, unsupported, rule_id=RULE_ID) == "unknown"


@pytest.mark.unit
@pytest.mark.parametrize(
    "previous",
    [
        _scan(1, modules={"ssl": {}}, projected=False),
        _scan(1, modules={"ssl": {}}, version=2),
        _scan(1, modules={"ssl": {}}, version=None),
        _scan(1, modules={"ssl": {}}, user_id=8),
        _scan(1, modules={"ssl": {}}, domain="other.example"),
        _scan(1, modules={"ssl": {}}, status=ScanStatus.FAILED),
    ],
)
def test_report_rule_incompatible_or_missing_baseline_is_unknown(
    previous: Scan,
) -> None:
    current = _scan(2, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})

    assert classify_report_rule_change(previous, current, rule_id=RULE_ID) == "unknown"


@pytest.mark.unit
def test_report_rule_rejects_stale_projection_and_bad_rule_id() -> None:
    clean = _scan(1, modules={"ssl": {}})
    risky = _scan(2, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    risky.finding_observations[0].ruleset_version = 2
    assert classify_report_rule_change(clean, risky, rule_id=RULE_ID) == "unknown"

    risky.finding_observations[0].ruleset_version = 1
    risky.finding_observations_projection_failed_at = risky.completed_at
    assert classify_report_rule_change(clean, risky, rule_id=RULE_ID) == "unknown"

    risky.finding_observations_projection_failed_at = None
    risky.finding_observations_projected_at = None
    assert classify_report_rule_change(clean, risky, rule_id=RULE_ID) == "unknown"

    with pytest.raises(ValueError, match="stable rule ID"):
        classify_report_rule_change(clean, risky, rule_id=" ")


@pytest.mark.unit
def test_narrow_report_rule_change_matches_direct_evidence() -> None:
    clean = _scan(1, modules={"ssl": {}})
    risky = _scan(2, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    continuing = _scan(3, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    repaired = _scan(4, modules={"ssl": {}})
    for previous, current in (
        (clean, risky),
        (risky, continuing),
        (continuing, repaired),
    ):
        assert classify_report_rule_change_from_evidence(
            previous,
            current,
            rule_id=RULE_ID,
            previous_observations=_narrow_observations(previous),
            current_observations=_narrow_observations(current),
            previous_successful_modules=frozenset({"ssl"}),
            current_successful_modules=frozenset({"ssl"}),
            evidence_complete=True,
        ) == classify_report_rule_change(previous, current, rule_id=RULE_ID)


@pytest.mark.unit
def test_narrow_report_rule_change_requires_complete_matching_evidence() -> None:
    risky = _scan(1, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    repaired = _scan(2, modules={"ssl": {}})
    args = {
        "rule_id": RULE_ID,
        "previous_observations": _narrow_observations(risky),
        "current_observations": _narrow_observations(repaired),
        "previous_successful_modules": frozenset({"ssl"}),
        "current_successful_modules": frozenset({"ssl"}),
        "evidence_complete": True,
    }
    assert (
        classify_report_rule_change_from_evidence(risky, repaired, **args) == "resolved"
    )
    assert (
        classify_report_rule_change_from_evidence(
            risky, repaired, **{**args, "evidence_complete": False}
        )
        == "unknown"
    )
    assert (
        classify_report_rule_change_from_evidence(
            risky, repaired, **{**args, "current_successful_modules": frozenset()}
        )
        == "unknown"
    )
    mismatched_observation = ReportRiskObservation(
        scan_id=uuid4(),
        rule_id=RULE_ID,
        ruleset_version=1,
        severity="high",
        evidence_modules=("ssl",),
    )
    assert (
        classify_report_rule_change_from_evidence(
            risky,
            repaired,
            **{**args, "previous_observations": (mismatched_observation,)},
        )
        == "unknown"
    )


@pytest.mark.unit
def test_narrow_report_rule_change_cannot_infer_across_uncertain_scan() -> None:
    risky = _scan(1, modules={"ssl": {}}, findings={RULE_ID: ["ssl"]})
    failed = _scan(2, modules={"ssl": None}, status=ScanStatus.FAILED)
    repaired = _scan(3, modules={"ssl": {}})

    assert (
        classify_report_rule_change_from_evidence(
            risky,
            failed,
            rule_id=RULE_ID,
            previous_observations=_narrow_observations(risky),
            current_observations=(),
            previous_successful_modules=frozenset({"ssl"}),
            current_successful_modules=frozenset(),
            evidence_complete=True,
        )
        == "unknown"
    )
    assert (
        classify_report_rule_change_from_evidence(
            failed,
            repaired,
            rule_id=RULE_ID,
            previous_observations=(),
            current_observations=(),
            previous_successful_modules=frozenset(),
            current_successful_modules=frozenset({"ssl"}),
            evidence_complete=True,
        )
        == "unknown"
    )
