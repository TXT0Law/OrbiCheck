"""Project a completed scan into evidence-backed risk observation candidates."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanStatus
from app.services.finding_identity import (
    FINDING_RULESET_VERSION,
    finding_evidence_modules,
    finding_rule_identity,
)
from app.services.security_analyzer import extract_key_findings
from app.services.transformers import _is_skipped


class FindingProjectionError(ValueError):
    """A scan's stored evidence cannot be projected with the current rules."""


@dataclass(frozen=True, slots=True)
class FindingObservationCandidate:
    scan_id: uuid.UUID
    user_id: int
    domain: str
    rule_id: str
    ruleset_version: int
    severity: str
    title: str
    description: str
    observed_at: datetime
    evidence_modules: tuple[str, ...]

    @property
    def idempotency_key(self) -> tuple[uuid.UUID, str]:
        return self.scan_id, self.rule_id


def build_finding_observations(scan: Scan) -> list[FindingObservationCandidate]:
    """Build active findings; absent or failed modules cannot supply evidence."""
    if scan.status != ScanStatus.COMPLETED:
        return []
    if scan.completed_at is None:
        raise ValueError("Completed scan is missing completed_at")

    raw_results = {
        row.module_name: row.raw_result
        for row in scan.module_results
        if row.status == ModuleStatus.SUCCESS
        and isinstance(row.raw_result, dict)
        and not _is_skipped(row)
    }
    observations: list[FindingObservationCandidate] = []
    seen_rule_ids: set[str] = set()
    for finding in extract_key_findings(raw_results, max_findings=None):
        evidence_modules = finding_evidence_modules(finding, raw_results)
        if not evidence_modules:
            continue
        identity = finding_rule_identity(finding)
        if identity.rule_id in seen_rule_ids:
            raise ValueError(f"Duplicate finding rule for scan: {identity.rule_id}")
        seen_rule_ids.add(identity.rule_id)
        observations.append(
            FindingObservationCandidate(
                scan_id=scan.id,
                user_id=scan.user_id,
                domain=scan.domain,
                rule_id=identity.rule_id,
                ruleset_version=identity.ruleset_version,
                severity=str(finding["severity"]),
                title=str(finding["title"]),
                description=str(finding["description"]),
                observed_at=scan.completed_at,
                evidence_modules=tuple(sorted(evidence_modules)),
            )
        )
    return observations


def persist_finding_observations(db: Session, scan_id: uuid.UUID) -> int:
    """Project one completed scan inside the caller's transaction.

    The scan row lock serializes concurrent projections. An already projected
    scan is left intact; a different ruleset requires explicit reconciliation.
    This function is not yet connected to scan completion or background jobs.
    """
    scan = db.execute(
        select(Scan)
        .where(Scan.id == scan_id)
        .options(selectinload(Scan.module_results))
        .execution_options(populate_existing=True)
        .with_for_update(of=Scan)
    ).scalar_one()
    if scan.status != ScanStatus.COMPLETED:
        return 0
    if scan.finding_observations_projected_at is not None:
        if scan.finding_ruleset_version != FINDING_RULESET_VERSION:
            raise FindingProjectionError("Existing projection uses another ruleset")
        return 0

    try:
        candidates = build_finding_observations(scan)
    except (ValueError, TypeError, OverflowError) as exc:
        raise FindingProjectionError("Stored scan evidence cannot be projected") from exc

    inserted = 0
    if candidates:
        rows = [
            {
                "id": uuid.uuid4(),
                "scan_id": candidate.scan_id,
                "rule_id": candidate.rule_id,
                "ruleset_version": candidate.ruleset_version,
                "severity": candidate.severity,
                "title": candidate.title,
                "description": candidate.description,
                "evidence_modules": list(candidate.evidence_modules),
                "observed_at": candidate.observed_at,
            }
            for candidate in candidates
        ]
        statement = insert(ScanFindingObservation).values(rows).on_conflict_do_nothing(
            constraint="uq_scan_finding_observation_scan_rule"
        )
        inserted = db.execute(statement).rowcount

    db.execute(
        update(Scan)
        .where(Scan.id == scan_id)
        .values(
            finding_observations_projected_at=datetime.now(timezone.utc),
            finding_ruleset_version=FINDING_RULESET_VERSION,
        )
    )
    return inserted
