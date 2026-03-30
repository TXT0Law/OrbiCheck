from __future__ import annotations

from uuid import UUID

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_multiple_scans_keep_state_isolated(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    module_result_factory,
    scan_record_factory,
) -> None:
    in_memory_scans: dict[UUID, object] = {}

    async def _fake_create_scan(_db, url: str, modules=None, user_id: int = 1):
        scan = scan_record_factory(
            url=url,
            domain=url.replace("https://", ""),
            status=ScanStatus.PENDING,
            progress=0,
            total_modules=3,
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

    monkeypatch.setattr(scan_service, "create_scan", _fake_create_scan)
    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(scan_service, "cancel_scan", _fake_cancel_scan)
    monkeypatch.setattr("app.api.v1.endpoints.scans.execute_scan.delay", lambda *_a, **_k: None)
    monkeypatch.setattr("app.api.v1.endpoints.scans.execute_scan.run", lambda *_a, **_k: None)

    created_ids = []
    for url in (
        "https://example.com",
        "https://iana.org",
        "https://openai.com",
    ):
        response = await async_client.post("/api/v1/scans", json={"url": url})
        created_ids.append(UUID(response.json()["data"]["id"]))

    in_memory_scans[created_ids[0]].status = ScanStatus.COMPLETED
    in_memory_scans[created_ids[0]].module_results = [
        module_result_factory("whois", ModuleStatus.SUCCESS, {"registrar": "One"}),
    ]
    in_memory_scans[created_ids[1]].status = ScanStatus.RUNNING
    in_memory_scans[created_ids[1]].module_results = [
        module_result_factory("whois", ModuleStatus.SUCCESS, {"registrar": "Two"}),
    ]
    in_memory_scans[created_ids[2]].status = ScanStatus.RUNNING
    in_memory_scans[created_ids[2]].module_results = [
        module_result_factory("whois", ModuleStatus.SUCCESS, {"registrar": "Three"}),
    ]

    await async_client.post(f"/api/v1/scans/{created_ids[1]}/cancel")
    detail_one = await async_client.get(f"/api/v1/scans/{created_ids[0]}/detail")
    detail_two = await async_client.get(f"/api/v1/scans/{created_ids[1]}/detail")
    detail_three = await async_client.get(f"/api/v1/scans/{created_ids[2]}/detail")

    assert detail_one.json()["data"]["whois"]["registrar"] == "One"
    assert detail_two.json()["data"]["status"] == "cancelled"
    assert detail_two.json()["data"]["whois"]["registrar"] == "Two"
    assert detail_three.json()["data"]["status"] == "running"
    assert detail_three.json()["data"]["whois"]["registrar"] == "Three"
