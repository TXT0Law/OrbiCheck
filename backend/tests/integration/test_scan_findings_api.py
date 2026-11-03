"""Scan finding API response contract and owner propagation."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ScanFindingObservation
from app.services import finding_observation
from app.services.finding_identity import FINDING_RULESET_VERSION
from app.services.finding_observation import ScanFindingList


@pytest.mark.integration
@pytest.mark.asyncio
async def test_scan_findings_endpoint_returns_owner_scoped_evidence(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    scan_id = uuid4()
    observed_at = datetime.now(timezone.utc)

    async def _list_findings(_db, requested_scan_id, user_id):
        assert requested_scan_id == scan_id
        assert user_id == 1
        return ScanFindingList(
            scan_id=scan_id,
            projection_status="ready",
            projected_at=observed_at,
            observations=[
                ScanFindingObservation(
                    rule_id="ssl.certificate_expiry",
                    ruleset_version=FINDING_RULESET_VERSION,
                    severity="high",
                    title="Expired certificate",
                    description="The certificate has expired.",
                    evidence_modules=["ssl"],
                    observed_at=observed_at,
                )
            ],
        )

    monkeypatch.setattr(finding_observation, "list_scan_findings", _list_findings)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/findings")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["scanId"] == str(scan_id)
    assert data["projectionStatus"] == "ready"
    assert data["projectedAt"] is not None
    assert data["observations"][0]["ruleId"] == "ssl.certificate_expiry"
    assert data["observations"][0]["evidenceModules"] == ["ssl"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_scan_findings_endpoint_hides_unowned_scan(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    scan_id = uuid4()

    async def _list_findings(_db, _scan_id, _user_id):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(finding_observation, "list_scan_findings", _list_findings)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/findings")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCAN_NOT_FOUND"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_scan_findings_endpoint_rejects_invalid_scan_id(async_client) -> None:
    response = await async_client.get("/api/v1/scans/not-a-uuid/findings")
    assert response.status_code == 422
