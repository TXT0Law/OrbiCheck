"""Project a completed scan into evidence-backed risk observation candidates."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanStatus
from app.services.finding_identity import finding_evidence_modules, finding_rule_identity
from app.services.security_analyzer import extract_key_findings


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
        if row.status == ModuleStatus.SUCCESS and isinstance(row.raw_result, dict)
    }
    successful_modules = set(raw_results)
    observations: list[FindingObservationCandidate] = []
    seen_rule_ids: set[str] = set()
    for finding in extract_key_findings(raw_results, max_findings=None):
        evidence_modules = finding_evidence_modules(finding, successful_modules)
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
    """Insert the completed scan's findings in the caller's transaction.

    A retry leaves existing observations intact. The database uniqueness
    constraint resolves concurrent retries without a read-before-write race.
    """
    scan = db.execute(
        select(Scan)
        .where(Scan.id == scan_id)
        .options(selectinload(Scan.module_results))
        .execution_options(populate_existing=True)
    ).scalar_one()
    candidates = build_finding_observations(scan)
    if not candidates:
        return 0

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
    return db.execute(statement).rowcount


async def refresh_finding_observations_after_retry(
    db: AsyncSession,
    scan_id: uuid.UUID,
    module_name: str,
    retried_at: datetime,
) -> None:
    """Reconcile current findings after a module retry in its transaction."""
    scan = (
        await db.execute(
            select(Scan)
            .where(Scan.id == scan_id)
            .options(selectinload(Scan.module_results))
            .execution_options(populate_existing=True)
            .with_for_update(of=Scan)
        )
    ).scalar_one()
    candidates = build_finding_observations(scan)
    rule_ids = [candidate.rule_id for candidate in candidates]
    stale = delete(ScanFindingObservation).where(ScanFindingObservation.scan_id == scan_id)
    if rule_ids:
        stale = stale.where(ScanFindingObservation.rule_id.not_in(rule_ids))
    await db.execute(stale)
    if not candidates:
        return

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
            "observed_at": (
                retried_at if module_name in candidate.evidence_modules else candidate.observed_at
            ),
        }
        for candidate in candidates
    ]
    statement = insert(ScanFindingObservation).values(rows)
    statement = statement.on_conflict_do_update(
        constraint="uq_scan_finding_observation_scan_rule",
        set_={
            "ruleset_version": statement.excluded.ruleset_version,
            "severity": statement.excluded.severity,
            "title": statement.excluded.title,
            "description": statement.excluded.description,
            "evidence_modules": statement.excluded.evidence_modules,
            "observed_at": case(
                (statement.excluded.evidence_modules.contains([module_name]), retried_at),
                else_=ScanFindingObservation.observed_at,
            ),
        },
    )
    await db.execute(statement)
