"""Conservative rule changes across a bounded scheduled-report scan period."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.models.scan import Scan, ScanStatus
from app.services.finding_report_changes import (
    ReportRuleChange,
    classify_report_rule_change_from_evidence,
)
from app.services.finding_report_evidence import (
    ReportRiskModulesPage,
    ReportRiskObservation,
    ReportRiskObservationsPage,
)
from app.services.finding_report_period import (
    REPORT_RISK_PERIOD_SCAN_MAX_LIMIT,
    ReportRiskPeriodScans,
)


@dataclass(frozen=True, slots=True)
class ReportRiskTransition:
    previous_scan_id: uuid.UUID | None
    current_scan_id: uuid.UUID
    rule_id: str
    change: ReportRuleChange


@dataclass(frozen=True, slots=True)
class ReportRiskPeriodChanges:
    transitions: tuple[ReportRiskTransition, ...]
    has_unknown_coverage: bool


def _scan_has_usable_evidence(scan: Scan, modules: ReportRiskModulesPage) -> bool:
    return (
        scan.status == ScanStatus.COMPLETED
        and scan.finding_observations_projected_at is not None
        and scan.finding_observations_projection_failed_at is None
        and scan.finding_ruleset_version is not None
        and scan.finding_ruleset_version > 0
        and bool(modules.successful_modules.get(scan.id))
    )


def classify_report_risk_period(
    *,
    user_id: int,
    domain: str,
    predecessor: Scan | None,
    period: ReportRiskPeriodScans,
    observations: ReportRiskObservationsPage,
    modules: ReportRiskModulesPage,
) -> ReportRiskPeriodChanges:
    """Classify adjacent scans while exposing gaps and truncation as unknown.

    The period must be the bounded, ordered result for one owner and domain.
    A missing predecessor makes the first scan's known risks unknown; later
    adjacent pairs may still yield changes. No pair jumps over a failed scan.
    """
    if user_id <= 0 or not domain or domain != domain.strip():
        raise ValueError("Report risk period requires an owner and domain")
    if len(period.scans) > REPORT_RISK_PERIOD_SCAN_MAX_LIMIT:
        raise ValueError("Report risk period has too many scans")

    scans = ([predecessor] if predecessor is not None else []) + period.scans
    if any(
        scan.user_id != user_id or scan.domain != domain or scan.completed_at is None
        for scan in scans
    ):
        raise ValueError("Report risk period contains an out-of-scope scan")
    scan_ids = [scan.id for scan in scans]
    if len(scan_ids) != len(set(scan_ids)) or any(
        (left.completed_at, left.id) >= (right.completed_at, right.id)
        for left, right in zip(scans, scans[1:])
    ):
        raise ValueError("Report risk period scans must be unique and ordered")

    known_ids = set(scan_ids)
    if any(row.scan_id not in known_ids for row in observations.observations) or any(
        scan_id not in known_ids for scan_id in modules.successful_modules
    ):
        raise ValueError("Report risk evidence contains an out-of-scope scan")

    by_scan: dict[uuid.UUID, list[ReportRiskObservation]] = {
        scan_id: [] for scan_id in scan_ids
    }
    for row in observations.observations:
        by_scan[row.scan_id].append(row)

    evidence_complete = not (
        period.has_more
        or observations.has_more
        or observations.oversized_evidence
        or modules.has_more
    )
    has_unknown = (
        not period.scans
        or predecessor is None
        or not evidence_complete
        or any(not _scan_has_usable_evidence(scan, modules) for scan in scans)
        or any(
            previous.finding_ruleset_version != current.finding_ruleset_version
            for previous, current in zip(scans, scans[1:])
        )
    )
    transitions: list[ReportRiskTransition] = []
    if predecessor is None and period.scans:
        first = period.scans[0]
        transitions.extend(
            ReportRiskTransition(None, first.id, rule_id, "unknown")
            for rule_id in sorted({row.rule_id for row in by_scan[first.id]})
        )

    for previous, current in zip(scans, scans[1:]):
        rule_ids = sorted(
            {row.rule_id for row in by_scan[previous.id]}
            | {row.rule_id for row in by_scan[current.id]}
        )
        for rule_id in rule_ids:
            change = classify_report_rule_change_from_evidence(
                previous,
                current,
                rule_id=rule_id,
                previous_observations=by_scan[previous.id],
                current_observations=by_scan[current.id],
                previous_successful_modules=modules.successful_modules.get(
                    previous.id, frozenset()
                ),
                current_successful_modules=modules.successful_modules.get(
                    current.id, frozenset()
                ),
                evidence_complete=evidence_complete,
            )
            has_unknown |= change == "unknown"
            transitions.append(
                ReportRiskTransition(previous.id, current.id, rule_id, change)
            )
    return ReportRiskPeriodChanges(tuple(transitions), has_unknown)
