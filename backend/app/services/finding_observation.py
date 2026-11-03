"""Project a completed scan into evidence-backed risk observation candidates."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from sqlalchemy import case, delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanStatus
from app.services.finding_identity import (
    FINDING_RULESET_VERSION,
    finding_evidence_modules,
    finding_rule_identity,
)
from app.services.security_analyzer import extract_key_findings
from app.services.transformers import _is_skipped

SCAN_FINDING_BACKFILL_BATCH_SIZE = 25
SCAN_FINDING_BACKFILL_MAX_BATCH_SIZE = 100
logger = structlog.get_logger(__name__)


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


@dataclass(frozen=True, slots=True)
class FindingBackfillPage:
    processed_scans: int
    inserted_observations: int
    failed_scans: int


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
    Scan completion remains unwired; the bounded backfill task invokes it.
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
            finding_observations_projection_failed_at=None,
        )
    )
    return inserted


def backfill_finding_observations_page(
    db: Session, limit: int = SCAN_FINDING_BACKFILL_BATCH_SIZE
) -> FindingBackfillPage:
    """Project one bounded page of historical completed scans; safe to repeat."""
    if not 1 <= limit <= SCAN_FINDING_BACKFILL_MAX_BATCH_SIZE:
        raise ValueError("Backfill limit is outside the allowed range")
    scan_ids = db.execute(
        select(Scan.id)
        .where(
            Scan.status == ScanStatus.COMPLETED,
            Scan.completed_at.is_not(None),
            Scan.finding_observations_projected_at.is_(None),
            Scan.finding_observations_projection_failed_at.is_(None),
        )
        .order_by(Scan.id)
        .limit(limit)
    ).scalars().all()
    inserted = 0
    failed = 0
    for scan_id in scan_ids:
        try:
            inserted += persist_finding_observations(db, scan_id)
        except FindingProjectionError as exc:
            failed += 1
            db.execute(
                update(Scan)
                .where(Scan.id == scan_id)
                .values(finding_observations_projection_failed_at=datetime.now(timezone.utc))
            )
            logger.warning(
                "scan_finding_backfill_projection_failed",
                scan_id=str(scan_id),
                error_type=type(exc.__cause__).__name__,
            )
    return FindingBackfillPage(
        processed_scans=len(scan_ids),
        inserted_observations=inserted,
        failed_scans=failed,
    )


async def invalidate_finding_observations_for_rescan(
    db: AsyncSession,
    scan_id: uuid.UUID,
    user_id: int,
) -> int:
    """Discard a terminal scan's old projection before reusing its ID.

    This is a database-only step in the caller's transaction. The caller must
    commit before clearing Redis keys or dispatching another scan task. It is
    not connected to the rescan endpoint yet.
    """
    scan = (
        await db.execute(
            select(Scan)
            .where(Scan.id == scan_id, Scan.user_id == user_id)
            .with_for_update(of=Scan)
        )
    ).scalar_one_or_none()
    if scan is None or scan.status not in (
        ScanStatus.COMPLETED,
        ScanStatus.FAILED,
        ScanStatus.CANCELLED,
    ):
        raise FindingProjectionError("Scan is unavailable for rescan invalidation")

    result = await db.execute(
        delete(ScanFindingObservation).where(ScanFindingObservation.scan_id == scan_id)
    )
    await db.execute(
        update(Scan)
        .where(Scan.id == scan_id)
        .values(
            finding_observations_projected_at=None,
            finding_ruleset_version=None,
            finding_observations_projection_failed_at=None,
        )
    )
    return result.rowcount


async def refresh_finding_observations_after_retry(
    db: AsyncSession,
    scan_id: uuid.UUID,
    module_name: str,
    retried_at: datetime,
) -> None:
    """Reconcile a retry's current rule set inside the caller's transaction.

    This helper is not connected to the retry endpoint yet. The scan lock
    serializes it with projection. No external I/O occurs while it is held.
    """
    scan = (
        await db.execute(
            select(Scan)
            .where(Scan.id == scan_id)
            .options(selectinload(Scan.module_results))
            .execution_options(populate_existing=True)
            .with_for_update(of=Scan)
        )
    ).scalar_one()
    try:
        candidates = build_finding_observations(scan)
    except (ValueError, TypeError, OverflowError) as exc:
        raise FindingProjectionError("Stored scan evidence cannot be projected") from exc

    rule_ids = [candidate.rule_id for candidate in candidates]
    stale = delete(ScanFindingObservation).where(ScanFindingObservation.scan_id == scan_id)
    if rule_ids:
        stale = stale.where(ScanFindingObservation.rule_id.not_in(rule_ids))
    await db.execute(stale)

    await db.execute(
        update(Scan)
        .where(Scan.id == scan_id)
        .values(
            finding_observations_projected_at=(
                datetime.now(timezone.utc) if scan.status == ScanStatus.COMPLETED else None
            ),
            finding_ruleset_version=(
                FINDING_RULESET_VERSION if scan.status == ScanStatus.COMPLETED else None
            ),
            finding_observations_projection_failed_at=None,
        )
    )
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
