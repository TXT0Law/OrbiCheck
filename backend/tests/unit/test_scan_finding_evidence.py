"""Owner isolation and bounded raw finding evidence reads."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import FindingEvidenceNotFoundError
from app.models.scan import ModuleStatus, ScanFindingObservation, ScanModuleResult
from app.services.finding_observation import (
    MAX_FINDING_EVIDENCE_BYTES,
    get_scan_finding_evidence,
)


class _Result:
    def __init__(self, value) -> None:
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value


class _Session:
    def __init__(self, finding, modules=()) -> None:
        self.values = iter((finding, list(modules)))
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _Result(next(self.values))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_evidence_query_hides_unowned_or_unprojected_finding() -> None:
    db = _Session(None)

    with pytest.raises(FindingEvidenceNotFoundError):
        await get_scan_finding_evidence(db, uuid4(), "ssl.certificate_expiry", user_id=7)

    assert len(db.statements) == 1
    sql = str(db.statements[0])
    assert "scans.user_id" in sql
    assert "finding_observations_projected_at IS NOT NULL" in sql
    assert "finding_observations_projection_failed_at IS NULL" in sql
    assert 7 in db.statements[0].compile().params.values()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_evidence_returns_only_supporting_successful_module_raw_data() -> None:
    scan_id = uuid4()
    observed_at = datetime.now(timezone.utc)
    finding = ScanFindingObservation(
        scan_id=scan_id,
        rule_id="headers.missing_csp",
        observed_at=observed_at,
        evidence_modules=["headers", "http-security"],
    )
    modules = [
        ScanModuleResult(
            id=uuid4(), scan_id=scan_id, module_name="headers", status=ModuleStatus.SUCCESS,
            raw_result={"X-Frame-Options": "DENY"},
        ),
        ScanModuleResult(
            id=uuid4(), scan_id=scan_id, module_name="http-security", status=ModuleStatus.SUCCESS,
            raw_result={"Content-Security-Policy": "default-src 'self'"},
        ),
    ]
    db = _Session(finding, modules)

    evidence = await get_scan_finding_evidence(db, scan_id, finding.rule_id, user_id=7)

    assert evidence.observed_at == observed_at
    assert [source.module_name for source in evidence.sources] == finding.evidence_modules
    assert [source.status for source in evidence.sources] == ["available", "available"]
    assert evidence.sources[0].raw_result == modules[0].raw_result
    module_query = db.statements[1]
    assert "scan_module_results.module_name IN" in str(module_query)
    assert finding.evidence_modules in module_query.compile().params.values()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_evidence_omits_large_or_missing_module_results() -> None:
    scan_id = uuid4()
    finding = ScanFindingObservation(
        scan_id=scan_id,
        rule_id="ports.dangerous_open",
        observed_at=datetime.now(timezone.utc),
        evidence_modules=["ports", "ssl", "hsts"],
    )
    modules = [
        ScanModuleResult(
            id=uuid4(), scan_id=scan_id, module_name="ports", status=ModuleStatus.SUCCESS,
            raw_result={"data": "x" * MAX_FINDING_EVIDENCE_BYTES},
        ),
        ScanModuleResult(
            id=uuid4(), scan_id=scan_id, module_name="ssl", status=ModuleStatus.FAILED,
            raw_result={"grade": "F"},
        ),
        ScanModuleResult(
            id=uuid4(), scan_id=scan_id, module_name="hsts", status=ModuleStatus.SUCCESS,
            raw_result={"skipped": True},
        ),
    ]
    db = _Session(finding, modules)

    evidence = await get_scan_finding_evidence(db, scan_id, finding.rule_id, user_id=7)

    assert [source.status for source in evidence.sources] == ["too_large", "missing", "missing"]
    assert all(source.raw_result is None for source in evidence.sources)
