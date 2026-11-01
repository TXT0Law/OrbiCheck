"""Finding evidence endpoint owner propagation and response validation."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import FindingEvidenceNotFoundError
from app.services import finding_observation
from app.services.finding_observation import FindingEvidenceSource, ScanFindingEvidence


@pytest.mark.integration
@pytest.mark.asyncio
async def test_finding_evidence_endpoint_returns_bounded_raw_sources(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    scan_id = uuid4()
    observed_at = datetime.now(timezone.utc)

    async def _get_evidence(_db, requested_scan_id, rule_id, user_id):
        assert requested_scan_id == scan_id
        assert rule_id == "ssl.certificate_expiry"
        assert user_id == 1
        return ScanFindingEvidence(
            scan_id=scan_id,
            rule_id=rule_id,
            observed_at=observed_at,
            sources=[FindingEvidenceSource("ssl", "available", {"valid_to": "Jan 1 2020 GMT"})],
        )

    monkeypatch.setattr(finding_observation, "get_scan_finding_evidence", _get_evidence)
    response = await async_client.get(
        f"/api/v1/scans/{scan_id}/findings/ssl.certificate_expiry/evidence"
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["scanId"] == str(scan_id)
    assert data["ruleId"] == "ssl.certificate_expiry"
    assert data["sources"] == [
        {"moduleName": "ssl", "status": "available", "rawResult": {"valid_to": "Jan 1 2020 GMT"}}
    ]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_finding_evidence_endpoint_hides_unowned_finding(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    scan_id = uuid4()

    async def _get_evidence(_db, _scan_id, _rule_id, _user_id):
        raise FindingEvidenceNotFoundError()

    monkeypatch.setattr(finding_observation, "get_scan_finding_evidence", _get_evidence)
    response = await async_client.get(
        f"/api/v1/scans/{scan_id}/findings/ssl.certificate_expiry/evidence"
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FINDING_EVIDENCE_NOT_FOUND"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_finding_evidence_endpoint_rejects_invalid_rule_id(async_client) -> None:
    response = await async_client.get(f"/api/v1/scans/{uuid4()}/findings/Invalid!Rule/evidence")

    assert response.status_code == 422
