"""Owner isolation and projection state for scan finding reads."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import Scan, ScanFindingObservation, ScanStatus
from app.services.finding_observation import list_scan_findings


class _Session:
    def __init__(self, scan: Scan | None) -> None:
        self.scan = scan
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return self

    def scalar_one_or_none(self) -> Scan | None:
        return self.scan


def _scan(status: ScanStatus = ScanStatus.COMPLETED) -> Scan:
    return Scan(id=uuid4(), user_id=7, url="https://example.com", domain="example.com", status=status)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_scopes_scan_to_owner_and_hides_foreign_scan() -> None:
    scan_id = uuid4()
    db = _Session(None)

    with pytest.raises(ScanNotFoundError):
        await list_scan_findings(db, scan_id, user_id=7)

    assert "scans.user_id" in str(db.statement)
    assert scan_id in db.statement.compile().params.values()
    assert 7 in db.statement.compile().params.values()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_distinguishes_pending_failed_and_clean_projection() -> None:
    scan = _scan()
    db = _Session(scan)

    pending = await list_scan_findings(db, scan.id, user_id=7)
    assert pending.projection_status == "pending"
    assert pending.observations == []

    scan.finding_observations_projection_failed_at = datetime.now(timezone.utc)
    failed = await list_scan_findings(db, scan.id, user_id=7)
    assert failed.projection_status == "failed"
    assert failed.observations == []

    scan.finding_observations_projection_failed_at = None
    scan.finding_observations_projected_at = datetime.now(timezone.utc)
    clean = await list_scan_findings(db, scan.id, user_id=7)
    assert clean.projection_status == "ready"
    assert clean.projected_at == scan.finding_observations_projected_at
    assert clean.observations == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_findings_query_returns_sorted_observations_only_for_completed_projection() -> None:
    scan = _scan()
    scan.finding_observations_projected_at = datetime.now(timezone.utc)
    scan.finding_observations = [
        ScanFindingObservation(rule_id="z.rule"),
        ScanFindingObservation(rule_id="a.rule"),
    ]
    db = _Session(scan)

    ready = await list_scan_findings(db, scan.id, user_id=7)
    assert [row.rule_id for row in ready.observations] == ["a.rule", "z.rule"]

    scan.status = ScanStatus.RUNNING
    unavailable = await list_scan_findings(db, scan.id, user_id=7)
    assert unavailable.projection_status == "unavailable"
    assert unavailable.projected_at is None
    assert unavailable.observations == []
