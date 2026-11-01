"""Project a completed scan into evidence-backed risk observation candidates."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

import structlog
from sqlalchemy import case, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import FindingEvidenceNotFoundError, ScanNotFoundError
from app.models.scan import (
    ModuleStatus,
    Scan,
    ScanFindingObservation,
    ScanModuleResult,
    ScanStatus,
)
from app.services.finding_identity import (
    FINDING_RULESET_VERSION,
    finding_evidence_modules,
    finding_rule_identity,
)
from app.services.security_analyzer import extract_key_findings
from app.services.transformers import _is_skipped

SCAN_FINDING_BACKFILL_BATCH_SIZE = 25
SCAN_FINDING_BACKFILL_MAX_BATCH_SIZE = 100
SCAN_FINDING_HISTORY_DEFAULT_LIMIT = 20
SCAN_FINDING_HISTORY_MAX_LIMIT = 100
SCAN_FINDING_HISTORY_MAX_OFFSET = 10_000
MAX_FINDING_EVIDENCE_BYTES = 65_536
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


@dataclass(frozen=True, slots=True)
class ScanFindingList:
    scan_id: uuid.UUID
    projection_status: Literal["ready", "pending", "failed", "unavailable"]
    projected_at: datetime | None
    observations: list[ScanFindingObservation]


@dataclass(frozen=True, slots=True)
class ScanFindingHistoryItem:
    scan_id: uuid.UUID
    domain: str
    observation: ScanFindingObservation


@dataclass(frozen=True, slots=True)
class ScanFindingHistoryPage:
    items: list[ScanFindingHistoryItem]
    total: int
    pending_scans: int
    failed_scans: int


@dataclass(frozen=True, slots=True)
class FindingEvidenceSource:
    module_name: str
    status: Literal["available", "missing", "too_large"]
    raw_result: dict[str, Any] | None


@dataclass(frozen=True, slots=True)
class ScanFindingEvidence:
    scan_id: uuid.UUID
    rule_id: str
    observed_at: datetime
    sources: list[FindingEvidenceSource]


async def get_scan_finding_evidence(
    db: AsyncSession, scan_id: uuid.UUID, rule_id: str, user_id: int
) -> ScanFindingEvidence:
    """Fetch current stored raw output only from a finding's supporting modules."""
    finding = (
        await db.execute(
            select(ScanFindingObservation)
            .join(Scan, ScanFindingObservation.scan_id == Scan.id)
            .where(
                ScanFindingObservation.scan_id == scan_id,
                ScanFindingObservation.rule_id == rule_id,
                Scan.user_id == user_id,
                Scan.status == ScanStatus.COMPLETED,
                Scan.finding_observations_projected_at.is_not(None),
                Scan.finding_observations_projection_failed_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if finding is None:
        raise FindingEvidenceNotFoundError()

    module_names = tuple(finding.evidence_modules)
    module_rows = (
        await db.execute(
            select(ScanModuleResult)
            .where(
                ScanModuleResult.scan_id == scan_id,
                ScanModuleResult.module_name.in_(module_names),
            )
            .order_by(
                ScanModuleResult.completed_at.desc().nulls_last(),
                ScanModuleResult.id.desc(),
            )
        )
    ).scalars().all()
    latest_modules: dict[str, ScanModuleResult] = {}
    for row in module_rows:
        latest_modules.setdefault(row.module_name, row)

    sources: list[FindingEvidenceSource] = []
    for module_name in module_names:
        module = latest_modules.get(module_name)
        if (
            module is None
            or module.status != ModuleStatus.SUCCESS
            or not isinstance(module.raw_result, dict)
            or _is_skipped(module)
        ):
            sources.append(FindingEvidenceSource(module_name, "missing", None))
            continue
        raw_bytes = len(json.dumps(module.raw_result, ensure_ascii=False).encode("utf-8"))
        if raw_bytes > MAX_FINDING_EVIDENCE_BYTES:
            sources.append(FindingEvidenceSource(module_name, "too_large", None))
            continue
        sources.append(FindingEvidenceSource(module_name, "available", module.raw_result))

    return ScanFindingEvidence(
        scan_id=scan_id,
        rule_id=rule_id,
        observed_at=finding.observed_at,
        sources=sources,
    )


async def list_scan_finding_history(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = SCAN_FINDING_HISTORY_DEFAULT_LIMIT,
    offset: int = 0,
    domain: str | None = None,
    rule_id: str | None = None,
) -> ScanFindingHistoryPage:
    """List one owner's projected history and report incomplete scan coverage."""
    if not 1 <= limit <= SCAN_FINDING_HISTORY_MAX_LIMIT:
        raise ValueError("History limit is outside the allowed range")
    if not 0 <= offset <= SCAN_FINDING_HISTORY_MAX_OFFSET:
        raise ValueError("History offset is outside the allowed range")

    scan_scope = [Scan.user_id == user_id, Scan.status == ScanStatus.COMPLETED]
    if domain is not None:
        scan_scope.append(Scan.domain == domain)
    ready_scope = [
        *scan_scope,
        Scan.finding_observations_projected_at.is_not(None),
        Scan.finding_observations_projection_failed_at.is_(None),
    ]
    finding_scope = [ScanFindingObservation.rule_id == rule_id] if rule_id is not None else []
    joined = select(ScanFindingObservation, Scan.domain).join(
        Scan, ScanFindingObservation.scan_id == Scan.id
    )
    page_rows = (
        await db.execute(
            joined.where(*ready_scope, *finding_scope)
            .order_by(
                ScanFindingObservation.observed_at.desc(),
                ScanFindingObservation.scan_id.desc(),
                ScanFindingObservation.rule_id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = (
        await db.execute(
            select(func.count(ScanFindingObservation.id))
            .join(Scan, ScanFindingObservation.scan_id == Scan.id)
            .where(*ready_scope, *finding_scope)
        )
    ).scalar_one()
    pending_scans, failed_scans = (
        await db.execute(
            select(
                func.count(Scan.id).filter(
                    Scan.finding_observations_projected_at.is_(None),
                    Scan.finding_observations_projection_failed_at.is_(None),
                ),
                func.count(Scan.id).filter(
                    Scan.finding_observations_projection_failed_at.is_not(None)
                ),
            ).where(*scan_scope)
        )
    ).one()
    return ScanFindingHistoryPage(
        items=[
            ScanFindingHistoryItem(
                scan_id=observation.scan_id,
                domain=scan_domain,
                observation=observation,
            )
            for observation, scan_domain in page_rows
        ],
        total=total,
        pending_scans=pending_scans,
        failed_scans=failed_scans,
    )


async def list_scan_findings(
    db: AsyncSession, scan_id: uuid.UUID, user_id: int
) -> ScanFindingList:
    """Read one owner's projected findings without equating missing data with zero risk."""
    scan = (
        await db.execute(
            select(Scan)
            .where(Scan.id == scan_id, Scan.user_id == user_id)
            .options(selectinload(Scan.finding_observations))
        )
    ).scalar_one_or_none()
    if scan is None:
        raise ScanNotFoundError(str(scan_id))

    if scan.status != ScanStatus.COMPLETED:
        projection_status: Literal["ready", "pending", "failed", "unavailable"] = "unavailable"
    elif scan.finding_observations_projection_failed_at is not None:
        projection_status = "failed"
    elif scan.finding_observations_projected_at is None:
        projection_status = "pending"
    else:
        projection_status = "ready"

    observations = (
        sorted(scan.finding_observations, key=lambda row: row.rule_id)
        if projection_status == "ready"
        else []
    )
    return ScanFindingList(
        scan_id=scan.id,
        projection_status=projection_status,
        projected_at=(
            scan.finding_observations_projected_at if projection_status == "ready" else None
        ),
        observations=observations,
    )


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
    """Insert the completed scan's findings in the caller's transaction.

    A retry leaves existing observations intact. The database uniqueness
    constraint resolves concurrent retries without a read-before-write race.
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
    """Project one bounded page of legacy completed scans; safe to repeat."""
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
