from uuid import UUID

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service


@pytest.mark.asyncio
@pytest.mark.e2e
async def test_full_scan_flow_request_to_result(
    async_client,
    monkeypatch,
    module_result_factory,
    scan_record_factory,
) -> None:
    in_memory_scans: dict[UUID, object] = {}

    async def _fake_create_scan(_db, url: str, modules=None, user_id: int = 1):
        assert user_id == 1
        scan = scan_record_factory(
            url=url,
            domain="example.com",
            status=ScanStatus.PENDING,
            progress=0,
            total_modules=3,
            completed_modules=0,
        )
        in_memory_scans[scan.id] = scan
        return scan

    async def _fake_get_scan(_db, scan_id: UUID, user_id: int | None = None):
        assert user_id in (None, 1)
        if scan_id not in in_memory_scans:
            raise ScanNotFoundError(str(scan_id))
        return in_memory_scans[scan_id]

    async def _fake_delete_scan(_db, scan_id: UUID, user_id: int | None = None):
        assert user_id in (None, 1)
        if scan_id not in in_memory_scans:
            raise ScanNotFoundError(str(scan_id))
        del in_memory_scans[scan_id]

    monkeypatch.setattr(scan_service, "create_scan", _fake_create_scan)
    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(scan_service, "delete_scan", _fake_delete_scan)
    monkeypatch.setattr(
        "app.api.v1.endpoints.scans.execute_scan.delay",
        lambda _scan_id, _modules=None: None,
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.scans.execute_scan.run",
        lambda _scan_id, _modules=None: None,
    )

    create_response = await async_client.post("/api/v1/scans", json={"url": "example.com"})
    assert create_response.status_code == 201
    create_payload = create_response.json()
    assert create_payload["status"] == "success"
    created_id = UUID(create_payload["data"]["id"])

    scan = in_memory_scans[created_id]
    scan.status = ScanStatus.COMPLETED
    scan.progress = 100
    scan.completed_modules = 3
    scan.security_score = 37
    scan.module_results = [
        module_result_factory(
            module_name="whois",
            status=ModuleStatus.SUCCESS,
            raw_result={"registrar": "Example Registrar"},
            duration_ms=8,
        ),
        module_result_factory(
            module_name="ports",
            status=ModuleStatus.SUCCESS,
            raw_result={"openPorts": [80, 443], "failedPorts": []},
            duration_ms=5,
        ),
        module_result_factory(
            module_name="features",
            status=ModuleStatus.FAILED,
            raw_result={"error": "upstream timeout"},
            error_message="upstream timeout",
            duration_ms=1000,
        ),
    ]

    detail_response = await async_client.get(f"/api/v1/scans/{created_id}/detail")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["status"] == "success"
    assert detail_payload["data"]["status"] == "completed"
    assert "whois" in detail_payload["data"]
    assert "moduleErrors" in detail_payload["data"]
    assert "features" in detail_payload["data"]["moduleErrors"]

    delete_response = await async_client.delete(f"/api/v1/scans/{created_id}")
    assert delete_response.status_code == 204

    missing_response = await async_client.get(f"/api/v1/scans/{created_id}")
    assert missing_response.status_code == 404

