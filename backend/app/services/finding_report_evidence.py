"""Bounded, owner-scoped observation evidence for report risk periods."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.scan import Scan, ScanFindingObservation
from app.services.finding_report_period import (
    REPORT_RISK_PERIOD_PREDECESSOR_LIMIT,
    REPORT_RISK_PERIOD_SCAN_MAX_LIMIT,
)

REPORT_RISK_EVIDENCE_MAX_SCANS = (
    REPORT_RISK_PERIOD_SCAN_MAX_LIMIT + REPORT_RISK_PERIOD_PREDECESSOR_LIMIT
)
REPORT_RISK_OBSERVATION_LIMIT = 5000
REPORT_RISK_OBSERVATION_MAX_MODULES = 16


@dataclass(frozen=True, slots=True)
class ReportRiskObservation:
    scan_id: uuid.UUID
    rule_id: str
    ruleset_version: int
    severity: str
    evidence_modules: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReportRiskObservationsPage:
    observations: list[ReportRiskObservation]
    has_more: bool
    oversized_evidence: bool


def load_report_risk_observations(
    db: Session, *, user_id: int, domain: str, scan_ids: tuple[uuid.UUID, ...]
) -> ReportRiskObservationsPage:
    """Read narrow observation columns without loading descriptions or raw results.

    A row or module cap makes the page incomplete. Downstream classification
    must then report unknown changes rather than infer that a rule was absent.
    """
    if user_id <= 0 or not domain or domain != domain.strip():
        raise ValueError("Report risk observations require an owner and domain")
    if (
        not scan_ids
        or len(scan_ids) > REPORT_RISK_EVIDENCE_MAX_SCANS
        or any(not isinstance(scan_id, uuid.UUID) for scan_id in scan_ids)
        or len(set(scan_ids)) != len(scan_ids)
    ):
        raise ValueError("Report risk observations require bounded unique scan IDs")

    query = (
        select(
            ScanFindingObservation.scan_id,
            ScanFindingObservation.rule_id,
            ScanFindingObservation.ruleset_version,
            ScanFindingObservation.severity,
            ScanFindingObservation.evidence_modules[
                1 : REPORT_RISK_OBSERVATION_MAX_MODULES + 1
            ],
            func.cardinality(ScanFindingObservation.evidence_modules),
        )
        .join(Scan, Scan.id == ScanFindingObservation.scan_id)
        .where(
            Scan.user_id == user_id,
            Scan.domain == domain,
            Scan.id.in_(scan_ids),
        )
        .order_by(ScanFindingObservation.scan_id, ScanFindingObservation.rule_id)
        .limit(REPORT_RISK_OBSERVATION_LIMIT + 1)
    )
    rows = db.execute(query).all()
    selected = rows[:REPORT_RISK_OBSERVATION_LIMIT]
    return ReportRiskObservationsPage(
        observations=[
            ReportRiskObservation(
                scan_id=scan_id,
                rule_id=rule_id,
                ruleset_version=ruleset_version,
                severity=severity,
                evidence_modules=tuple(evidence_modules),
            )
            for scan_id, rule_id, ruleset_version, severity, evidence_modules, _ in selected
        ],
        has_more=len(rows) > REPORT_RISK_OBSERVATION_LIMIT,
        oversized_evidence=any(
            module_count > REPORT_RISK_OBSERVATION_MAX_MODULES
            for _, _, _, _, _, module_count in selected
        ),
    )
