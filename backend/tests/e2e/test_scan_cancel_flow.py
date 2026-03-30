from __future__ import annotations

from uuid import UUID

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_scan_cancel_flow_preserves_partial_results(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    module_result_factory,
    scan_record_factory,
) -> None:
    in_memory_scans: dict[UUID, object] = {}

    async def _fake_create_scan(_db, url: str, modules=None, user_id: int = 1):
        scan = scan_record_factory(
            url=url,
            domain="example.com",
            status=ScanStatus.PENDING,
            progress=0,
            total_modules=5,
            completed_modules=0,
        )
        in_memory_scans[scan.id] = scan
        return scan

    async def _fake_get_scan(_db, scan_id: UUID, user_id: int | None = None):
        if scan_id not in in_memory_scans:
            raise ScanNotFoundError(str(scan_id))
        return in_memory_scans[scan_id]

    async def _fake_cancel_scan(_db, scan_id: UUID, user_id: int | None = None):
        scan = await _fake_get_scan(_db, scan_id, user_id)
        scan.status = ScanStatus.CANCELLED
        return scan

    async def _fake_list_scans(*_args, **_kwargs):
        return list(in_memory_scans.values()), len(in_memory_scans)

    monkeypatch.setattr(scan_service, "create_scan", _fake_create_scan)
    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(scan_service, "cancel_scan", _fake_cancel_scan)
    monkeypatch.setattr(scan_service, "list_scans", _fake_list_scans)
    monkeypatch.setattr("app.api.v1.endpoints.scans.execute_scan.delay", lambda *_a, **_k: None)
    monkeypatch.setattr("app.api.v1.endpoints.scans.execute_scan.run", lambda *_a, **_k: None)

    created = await async_client.post("/api/v1/scans", json={"url": "example.com"})
    scan_id = UUID(created.json()["data"]["id"])
    scan = in_memory_scans[scan_id]
    scan.status = ScanStatus.RUNNING
    scan.progress = 40
    scan.completed_modules = 2
    scan.module_results = [
        module_result_factory("whois", ModuleStatus.SUCCESS, {"registrar": "Example"}),
        module_result_factory("ports", ModuleStatus.SUCCESS, {"openPorts": [80], "failedPorts": []}),
        module_result_factory("features", ModuleStatus.PENDING),
        module_result_factory("dns", ModuleStatus.PENDING),
        module_result_factory("headers", ModuleStatus.PENDING),
    ]

    cancel_response = await async_client.post(f"/api/v1/scans/{scan_id}/cancel")
    detail_response = await async_client.get(f"/api/v1/scans/{scan_id}/detail")
    list_response = await async_client.get("/api/v1/scans")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"]["status"] == "cancelled"
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["status"] == "cancelled"
    assert detail["whois"]["registrar"] == "Example"
    assert detail["ports"][0]["port"] == 80
    assert list_response.status_code == 200
    assert list_response.json()["data"]["total"] == 1
