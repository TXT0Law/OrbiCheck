"""Owner isolation and projection state for scan finding reads."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import Scan, ScanFindingObservation, ScanStatus
from app.services.finding_identity import FINDING_RULESET_VERSION, MAX_FINDING_RULES
from app.services.finding_observation import list_scan_findings


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value


class _Session:
    def __init__(self, scan: Scan | None, observations=None) -> None:
        self.scan = scan
        self.observations = observations or []
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _Result(self.scan)
        return _Result(self.observations)


def _scan(status: ScanStatus = ScanStatus.COMPLETED) -> Scan:
    return Scan(id=uuid4(), user_id=7, url="https://example.com", domain="example.com", status=status)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_hides_foreign_scan_before_reading_observations() -> None:
    scan_id = uuid4()
    db = _Session(None)

    with pytest.raises(ScanNotFoundError):
        await list_scan_findings(db, scan_id, user_id=7)

    assert len(db.statements) == 1
    assert "scans.user_id" in str(db.statements[0])
    assert scan_id in db.statements[0].compile().params.values()
    assert 7 in db.statements[0].compile().params.values()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_distinguishes_pending_failed_and_clean_projection() -> None:
    scan = _scan()
    pending = await list_scan_findings(_Session(scan), scan.id, user_id=7)
    assert pending.projection_status == "pending"
    assert pending.observations == []

    scan.finding_observations_projection_failed_at = datetime.now(timezone.utc)
    failed = await list_scan_findings(_Session(scan), scan.id, user_id=7)
    assert failed.projection_status == "failed"
    assert failed.observations == []

    scan.finding_observations_projection_failed_at = None
    scan.finding_observations_projected_at = datetime.now(timezone.utc)
    scan.finding_ruleset_version = FINDING_RULESET_VERSION
    clean = await list_scan_findings(_Session(scan), scan.id, user_id=7)
    assert clean.projection_status == "ready"
    assert clean.projected_at == scan.finding_observations_projected_at
    assert clean.observations == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_does_not_expose_stale_or_incomplete_projection() -> None:
    scan = _scan()
    scan.finding_observations_projected_at = datetime.now(timezone.utc)
    scan.finding_ruleset_version = FINDING_RULESET_VERSION - 1
    stale_db = _Session(scan)

    stale = await list_scan_findings(stale_db, scan.id, user_id=7)
    assert stale.projection_status == "unavailable"
    assert stale.observations == []
    assert len(stale_db.statements) == 1

    scan.finding_ruleset_version = FINDING_RULESET_VERSION
    scan.status = ScanStatus.RUNNING
    running = await list_scan_findings(_Session(scan), scan.id, user_id=7)
    assert running.projection_status == "unavailable"
    assert running.projected_at is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_bounds_evidence_and_fails_closed_on_version_mismatch() -> None:
    scan = _scan()
    scan.finding_observations_projected_at = datetime.now(timezone.utc)
    scan.finding_ruleset_version = FINDING_RULESET_VERSION
    observations = [
        ScanFindingObservation(rule_id="ssl.certificate_expiry", ruleset_version=FINDING_RULESET_VERSION)
    ]
    db = _Session(scan, observations)

    ready = await list_scan_findings(db, scan.id, user_id=7)
    assert ready.projection_status == "ready"
    assert ready.observations == observations
    assert "LIMIT" in str(db.statements[1])
    assert MAX_FINDING_RULES + 1 in db.statements[1].compile().params.values()

    observations[0].ruleset_version += 1
    mismatched = await list_scan_findings(_Session(scan, observations), scan.id, user_id=7)
    assert mismatched.projection_status == "failed"
    assert mismatched.observations == []

    oversized = [ScanFindingObservation(rule_id=f"rule.{n}", ruleset_version=FINDING_RULESET_VERSION)
                 for n in range(MAX_FINDING_RULES + 1)]
    excessive = await list_scan_findings(_Session(scan, oversized), scan.id, user_id=7)
    assert excessive.projection_status == "failed"
    assert excessive.observations == []
