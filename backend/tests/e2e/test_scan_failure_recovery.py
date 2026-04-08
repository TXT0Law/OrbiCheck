from __future__ import annotations

from uuid import UUID

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_scan_detail_shows_successes_and_failures_together(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    module_result_factory,
    scan_record_factory,
) -> None:
    in_memory_scans: dict[UUID, object] = {}

    async def _fake_create_scan(
        _db,
        url: str,
        modules=None,
        user_id: int = 1,
        enable_port_scan: bool = False,
        port_scan_profile: str = "quick",
        acknowledge_scan_authorization: bool = False,
    ):
        scan = scan_record_factory(
            url=url,
            domain="example.com",
            status=ScanStatus.PENDING,
            progress=0,
            total_modules=5,
            completed_modules=0,
        )
        assert enable_port_scan is False
        assert port_scan_profile == "quick"
        assert acknowledge_scan_authorization is False
        in_memory_scans[scan.id] = scan
        return scan

    async def _fake_get_scan(_db, scan_id: UUID, user_id: int | None = None):
        if scan_id not in in_memory_scans:
            raise ScanNotFoundError(str(scan_id))
        return in_memory_scans[scan_id]

    monkeypatch.setattr(scan_service, "create_scan", _fake_create_scan)
    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr("app.api.v1.endpoints.scans.execute_scan.delay", lambda *_a, **_k: None)
    monkeypatch.setattr("app.api.v1.endpoints.scans.execute_scan.run", lambda *_a, **_k: None)

    created = await async_client.post("/api/v1/scans", json={"url": "example.com"})
    scan_id = UUID(created.json()["data"]["id"])
    scan = in_memory_scans[scan_id]
    scan.status = ScanStatus.COMPLETED
    scan.progress = 100
    scan.completed_modules = 5
    scan.security_score = None
    scan.module_results = [
        module_result_factory("whois", ModuleStatus.SUCCESS, {"registrar": "Example"}),
        module_result_factory("ports", ModuleStatus.SUCCESS, {"openPorts": [443], "failedPorts": []}),
        module_result_factory("headers", ModuleStatus.SUCCESS, {"server": "nginx"}),
        module_result_factory("features", ModuleStatus.FAILED, {"error": "upstream timeout"}, "upstream timeout"),
        module_result_factory("dns", ModuleStatus.FAILED, {"error": "parse error"}, "parse error"),
    ]

    response = await async_client.get(f"/api/v1/scans/{scan_id}/detail")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["whois"]["registrar"] == "Example"
    assert data["ports"]["entries"][0]["port"] == 443
    assert data["moduleErrors"]["features"]["message"] == "upstream timeout"
    assert data["moduleErrors"]["dns"]["message"] == "parse error"
    assert data["securityScore"] is not None
    assert "severity" in data and "keyFindings" in data and "categorySummary" in data
