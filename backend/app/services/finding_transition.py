"""Pure, evidence-aware high-risk transitions for future notification dispatch."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.services.transformers import _is_skipped

HIGH_RISK_SEVERITIES = frozenset({"critical", "high"})
MAX_NOTIFICATION_HISTORY_SCANS = 100


@dataclass(frozen=True, slots=True)
class HighRiskTransition:
    scan_id: uuid.UUID
    rule_id: str
    kind: Literal["new", "regressed"]
    ruleset_version: int
    baseline_scan_id: uuid.UUID
    baseline_completed_at: datetime

    @property
    def dedup_key(self) -> tuple[uuid.UUID, datetime, str, int]:
        """Identify one risk episode across concurrent scans and retries.

        A rescan reuses the scan ID, so the baseline completion time must be
        included. The globally unique baseline scan ID fixes owner and site.
        """
        return (
            self.baseline_scan_id,
            self.baseline_completed_at,
            self.rule_id,
            self.ruleset_version,
        )


@dataclass(frozen=True, slots=True)
class RiskHistoryPage:
    scans: list[Scan]
    complete: bool


async def load_recent_risk_history(db: AsyncSession, current: Scan) -> RiskHistoryPage:
    """Load a bounded, owner-scoped baseline with only relevant module evidence.

    ``complete=False`` means older history exists. Callers must not label a
    finding as globally new when the earlier risk history was truncated.
    """
    if (
        current.status != ScanStatus.COMPLETED
        or current.completed_at is None
        or current.finding_observations_projected_at is None
        or current.finding_observations_projection_failed_at is not None
        or current.finding_ruleset_version is None
    ):
        return RiskHistoryPage(scans=[], complete=False)

    source_names = {
        module_name
        for finding in current.finding_observations
        if finding.severity in HIGH_RISK_SEVERITIES
        for module_name in finding.evidence_modules
    }
    if not source_names:
        return RiskHistoryPage(scans=[], complete=True)

    query = (
        select(Scan)
        .where(
            Scan.user_id == current.user_id,
            Scan.domain == current.domain,
            Scan.status == ScanStatus.COMPLETED,
            Scan.finding_ruleset_version == current.finding_ruleset_version,
            Scan.finding_observations_projected_at.is_not(None),
            Scan.finding_observations_projection_failed_at.is_(None),
            Scan.completed_at.is_not(None),
            or_(
                Scan.completed_at < current.completed_at,
                and_(Scan.completed_at == current.completed_at, Scan.id < current.id),
            ),
        )
        .options(
            selectinload(Scan.finding_observations),
            selectinload(
                Scan.module_results.and_(ScanModuleResult.module_name.in_(source_names))
            ),
        )
        .order_by(Scan.completed_at.desc(), Scan.id.desc())
        .limit(MAX_NOTIFICATION_HISTORY_SCANS + 1)
    )
    scans = list((await db.execute(query)).scalars().all())
    return RiskHistoryPage(
        scans=scans[:MAX_NOTIFICATION_HISTORY_SCANS],
        complete=len(scans) <= MAX_NOTIFICATION_HISTORY_SCANS,
    )


def _ready_for_comparison(scan: Scan, current: Scan) -> bool:
    return (
        scan.id != current.id
        and scan.user_id == current.user_id
        and scan.domain == current.domain
        and scan.status == ScanStatus.COMPLETED
        and scan.completed_at is not None
        and current.completed_at is not None
        and (scan.completed_at, scan.id) < (current.completed_at, current.id)
        and scan.finding_observations_projected_at is not None
        and scan.finding_observations_projection_failed_at is None
        and scan.finding_ruleset_version == current.finding_ruleset_version
        and all(
            row.ruleset_version == scan.finding_ruleset_version
            for row in scan.finding_observations
        )
    )


def _successful_modules(scan: Scan) -> frozenset[str]:
    return frozenset(
        row.module_name
        for row in scan.module_results
        if row.status == ModuleStatus.SUCCESS
        and isinstance(row.raw_result, dict)
        and not _is_skipped(row)
    )


def classify_high_risk_transitions(
    current: Scan, history: RiskHistoryPage
) -> list[HighRiskTransition]:
    """Find newly observed or returning high risks only with a proven baseline.

    Callers load observations and module results for each scan. A prior scan
    with missing, failed, skipped, unprojected, or incompatible evidence cannot
    prove a rule was absent. The first comparable scan forms a baseline and
    never triggers a notification on its own.
    """
    if (
        current.status != ScanStatus.COMPLETED
        or current.completed_at is None
        or current.finding_observations_projected_at is None
        or current.finding_observations_projection_failed_at is not None
        or current.finding_ruleset_version is None
        or any(
            row.ruleset_version != current.finding_ruleset_version
            for row in current.finding_observations
        )
    ):
        return []

    prior_scans = sorted(
        (scan for scan in history.scans if _ready_for_comparison(scan, current)),
        key=lambda scan: (scan.completed_at, scan.id),
        reverse=True,
    )
    prior_findings: list[set[str]] = [
        {row.rule_id for row in scan.finding_observations}
        for scan in prior_scans
    ]
    prior_modules = [_successful_modules(scan) for scan in prior_scans]
    current_modules = _successful_modules(current)

    transitions: list[HighRiskTransition] = []
    for finding in current.finding_observations:
        if finding.severity not in HIGH_RISK_SEVERITIES:
            continue
        supporting_modules = set(finding.evidence_modules) & current_modules
        if not supporting_modules:
            continue
        for index, earlier in enumerate(prior_scans):
            if finding.rule_id in prior_findings[index]:
                break
            if not supporting_modules.intersection(prior_modules[index]):
                continue
            had_earlier_risk = any(
                finding.rule_id in older_findings
                for older_findings in prior_findings[index + 1 :]
            )
            if not had_earlier_risk and not history.complete:
                break
            if earlier.completed_at is None:
                continue
            transitions.append(
                HighRiskTransition(
                    scan_id=current.id,
                    rule_id=finding.rule_id,
                    kind="regressed" if had_earlier_risk else "new",
                    ruleset_version=current.finding_ruleset_version,
                    baseline_scan_id=earlier.id,
                    baseline_completed_at=earlier.completed_at,
                )
            )
            break
    return transitions
