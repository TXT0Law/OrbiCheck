"""Risk history API boundary validation and response shape."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.models.scan import ScanFindingObservation
from app.services import finding_observation
from app.services.finding_observation import ScanFindingHistoryItem, ScanFindingHistoryPage


@pytest.mark.integration
@pytest.mark.asyncio
async def test_history_endpoint_passes_owner_and_validated_filters(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, object] = {}
    scan_id = uuid4()
    observed_at = datetime.now(timezone.utc)

    async def _history(_db, **kwargs):
        captured.update(kwargs)
        return ScanFindingHistoryPage(
            items=[
                ScanFindingHistoryItem(
                    scan_id=scan_id,
                    domain="example.com",
                    observation=ScanFindingObservation(
                        rule_id="ssl.certificate_expiry",
                        ruleset_version=1,
                        severity="high",
                        title="Expired certificate",
                        description="The certificate has expired.",
                        evidence_modules=["ssl"],
                        observed_at=observed_at,
                    ),
                )
            ],
            total=1,
            pending_scans=2,
            failed_scans=1,
            unavailable_scans=3,
        )

    monkeypatch.setattr(finding_observation, "list_scan_finding_history", _history)
    response = await async_client.get(
        "/api/v1/scans/findings/history?limit=5&offset=10&domain=example.com"
        "&rule_id=ssl.certificate_expiry"
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 1
    assert data["pendingScans"] == 2
    assert data["failedScans"] == 1
    assert data["unavailableScans"] == 3
    assert data["items"][0]["scanId"] == str(scan_id)
    assert data["items"][0]["observation"]["ruleId"] == "ssl.certificate_expiry"
    assert captured == {
        "user_id": 1,
        "limit": 5,
        "offset": 10,
        "domain": "example.com",
        "rule_id": "ssl.certificate_expiry",
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_history_endpoint_rejects_invalid_pagination_and_filters(async_client) -> None:
    for query in (
        "limit=0",
        f"limit={finding_observation.SCAN_FINDING_HISTORY_MAX_LIMIT + 1}",
        f"offset={finding_observation.SCAN_FINDING_HISTORY_MAX_OFFSET + 1}",
        "domain=",
        "rule_id=",
        "rule_id=Invalid!Rule",
    ):
        response = await async_client.get(f"/api/v1/scans/findings/history?{query}")
        assert response.status_code == 422
