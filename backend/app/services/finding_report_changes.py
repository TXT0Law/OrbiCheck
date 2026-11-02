"""Conservative rule-level changes between two projected report scans."""

from __future__ import annotations

from typing import Literal

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanStatus
from app.services.transformers import _is_skipped

ReportRuleChange = Literal["new", "continuing", "resolved", "unknown"]


def _ready_pair(previous: Scan, current: Scan) -> bool:
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
        and all(row.ruleset_version == version for row in previous.finding_observations)
        and all(row.ruleset_version == version for row in current.finding_observations)
    )


def _successful_modules(scan: Scan) -> frozenset[str]:
    return frozenset(
        row.module_name
        for row in scan.module_results
        if row.status == ModuleStatus.SUCCESS
        and isinstance(row.raw_result, dict)
        and not _is_skipped(row)
    )


def _observation(scan: Scan, rule_id: str) -> ScanFindingObservation | None:
    matches = [row for row in scan.finding_observations if row.rule_id == rule_id]
    if len(matches) > 1:
        raise ValueError("A scan has duplicate observations for one rule")
    return matches[0] if matches else None


def classify_report_rule_change(
    previous: Scan, current: Scan, *, rule_id: str
) -> ReportRuleChange:
    """Classify one known rule only when its own module evidence is comparable.

    Missing, failed, skipped, or unrelated modules cannot prove absence. The
    caller must separately report absent scans and truncated period coverage.
    """
    if not rule_id or rule_id != rule_id.strip():
        raise ValueError("A stable rule ID is required")
    if not _ready_pair(previous, current):
        return "unknown"

    try:
        before = _observation(previous, rule_id)
        after = _observation(current, rule_id)
    except ValueError:
        return "unknown"
    if before is None and after is None:
        return "unknown"

    previous_success = _successful_modules(previous)
    current_success = _successful_modules(current)
    if before is not None and not set(before.evidence_modules).intersection(previous_success):
        return "unknown"
    if after is not None and not set(after.evidence_modules).intersection(current_success):
        return "unknown"
    if before is not None and after is not None:
        return "continuing"
    if after is not None:
        return (
            "new"
            if set(after.evidence_modules).intersection(previous_success)
            else "unknown"
        )
    return (
        "resolved"
        if before is not None and set(before.evidence_modules).intersection(current_success)
        else "unknown"
    )
