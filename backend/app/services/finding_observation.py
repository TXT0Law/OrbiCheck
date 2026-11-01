"""Project a completed scan into evidence-backed risk observation candidates."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.models.scan import ModuleStatus, Scan, ScanStatus
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
