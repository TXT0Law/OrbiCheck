"""Conservative rule-level changes between two projected report scans."""

from __future__ import annotations

from collections.abc import Sequence, Set
from typing import Literal

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanStatus
from app.services.finding_report_evidence import ReportRiskObservation
from app.services.transformers import _is_skipped

ReportRuleChange = Literal["new", "continuing", "resolved", "unknown"]
ReportObservation = ScanFindingObservation | ReportRiskObservation


def _ready_pair(
    previous: Scan,
    current: Scan,
    previous_observations: Sequence[ReportObservation],
    current_observations: Sequence[ReportObservation],
) -> bool:
    version = previous.finding_ruleset_version
    return (
        previous.id != current.id
        and previous.user_id == current.user_id
        and previous.domain == current.domain
        and previous.status == ScanStatus.COMPLETED
        and current.status == ScanStatus.COMPLETED
        and previous.completed_at is not None
        and current.completed_at is not None
        and (previous.completed_at, previous.id) < (current.completed_at, current.id)
        and previous.finding_observations_projected_at is not None
        and current.finding_observations_projected_at is not None
        and previous.finding_observations_projection_failed_at is None
        and current.finding_observations_projection_failed_at is None
        and version is not None
        and version > 0
        and version == current.finding_ruleset_version
        and all(row.ruleset_version == version for row in previous_observations)
        and all(row.ruleset_version == version for row in current_observations)
    )


def _successful_modules(scan: Scan) -> frozenset[str]:
    return frozenset(
        row.module_name
        for row in scan.module_results
        if row.status == ModuleStatus.SUCCESS
        and isinstance(row.raw_result, dict)
        and not _is_skipped(row)
    )


def _observation(
    observations: Sequence[ReportObservation], rule_id: str
) -> ReportObservation | None:
    matches = [row for row in observations if row.rule_id == rule_id]
    if len(matches) > 1:
        raise ValueError("A scan has duplicate observations for one rule")
    return matches[0] if matches else None


def _classify_rule_evidence(
    previous_observations: Sequence[ReportObservation],
    current_observations: Sequence[ReportObservation],
    previous_success: Set[str],
    current_success: Set[str],
    rule_id: str,
) -> ReportRuleChange:
    try:
        before = _observation(previous_observations, rule_id)
        after = _observation(current_observations, rule_id)
    except ValueError:
        return "unknown"
    if before is None and after is None:
        return "unknown"

    if before is not None and not set(before.evidence_modules).intersection(
        previous_success
    ):
        return "unknown"
    if after is not None and not set(after.evidence_modules).intersection(
        current_success
    ):
        return "unknown"
    if before is not None and after is not None:
        return "continuing"
    # An absent finding cannot prove a change if any of its previously
    # supporting modules failed or were skipped on the other scan.
    if after is not None:
        return (
            "new"
            if set(after.evidence_modules).issubset(previous_success)
            else "unknown"
        )
    return (
        "resolved"
        if before is not None
        and set(before.evidence_modules).issubset(current_success)
        else "unknown"
    )


def classify_report_rule_change(
    previous: Scan, current: Scan, *, rule_id: str
) -> ReportRuleChange:
    """Classify one known rule using the scans' directly loaded evidence."""
    if not rule_id or rule_id != rule_id.strip():
        raise ValueError("A stable rule ID is required")
    if not _ready_pair(
        previous, current, previous.finding_observations, current.finding_observations
    ):
        return "unknown"
    return _classify_rule_evidence(
        previous.finding_observations,
        current.finding_observations,
        _successful_modules(previous),
        _successful_modules(current),
        rule_id,
    )


def classify_report_rule_change_from_evidence(
    previous: Scan,
    current: Scan,
    *,
    rule_id: str,
    previous_observations: Sequence[ReportRiskObservation],
    current_observations: Sequence[ReportRiskObservation],
    previous_successful_modules: Set[str],
    current_successful_modules: Set[str],
    evidence_complete: bool,
) -> ReportRuleChange:
    """Classify narrow, bounded evidence only when all pages are complete.

    The caller must pass false if any scan, observation, module, or per-row
    evidence was truncated. Missing/skipped modules cannot prove absence.
    """
    if not rule_id or rule_id != rule_id.strip():
        raise ValueError("A stable rule ID is required")
    if not evidence_complete or not _ready_pair(
        previous, current, previous_observations, current_observations
    ):
        return "unknown"
    if any(row.scan_id != previous.id for row in previous_observations) or any(
        row.scan_id != current.id for row in current_observations
    ):
        return "unknown"
    return _classify_rule_evidence(
        previous_observations,
        current_observations,
        previous_successful_modules,
        current_successful_modules,
        rule_id,
    )
