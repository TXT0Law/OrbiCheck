from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError, ScanServiceError
from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_health_endpoint_returns_ok(async_client) -> None:
    response = await async_client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_scans_returns_success_payload(async_client, monkeypatch, scan_record_factory) -> None:
    fake_scan = scan_record_factory(status=ScanStatus.COMPLETED, progress=100, completed_modules=3)

    async def _fake_list_scans(
        _db,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
        search: str | None = None,
        sort_by: str = "created_at_desc",
        status_group: str = "all",
    ):
        assert user_id == 1
        return [fake_scan], 1

    monkeypatch.setattr(scan_service, "list_scans", _fake_list_scans)

    response = await async_client.get("/api/v1/scans?limit=10&offset=0")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["data"]["total"] == 1
    assert payload["meta"] == {
        "limit": 10,
        "offset": 0,
        "search": None,
        "sortBy": "created_at_desc",
        "statusGroup": "all",
    }
    assert len(payload["data"]["scans"]) == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_scan_returns_422_on_validation_error(async_client) -> None:
    response = await async_client.post("/api/v1/scans", json={})

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_scan_returns_404_when_resource_not_found(async_client, monkeypatch) -> None:
    missing_id = uuid4()

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        raise ScanNotFoundError(str(missing_id))

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    response = await async_client.get(f"/api/v1/scans/{missing_id}")

    assert response.status_code == 404
    payload = response.json()
    assert payload["status"] == "error"
    assert payload["error"]["code"] == "SCAN_NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_scan_returns_502_when_external_dependency_fails(async_client, monkeypatch) -> None:
    scan_id = uuid4()

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        raise ScanServiceError("OSINT engine request failed")

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    response = await async_client.get(f"/api/v1/scans/{scan_id}")

    assert response.status_code == 502
    payload = response.json()
    assert payload["status"] == "error"
    assert payload["error"]["code"] == "SCAN_SERVICE_ERROR"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_scan_accepts_string_raw_result_without_500(async_client, monkeypatch) -> None:
    scan_id = uuid4()
    fake_scan = SimpleNamespace(
        id=scan_id,
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.PENDING,
        progress=0,
        total_modules=33,
        completed_modules=0,
        security_score=None,
        error_message=None,
        started_at=None,
        completed_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        module_results=[
            SimpleNamespace(
                id=uuid4(),
                module_name="social-tags",
                status="failed",
                raw_result='{"error":"upstream 404"}',
                error_message="upstream 404",
                duration_ms=None,
                completed_at=None,
            )
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    response = await async_client.get(f"/api/v1/scans/{scan_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["data"]["moduleResults"][0]["rawResult"] == '{"error":"upstream 404"}'


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_all_scans_returns_deleted_count(async_client, monkeypatch) -> None:
    async def _fake_delete_scans(
        _db,
        user_id: int,
        search: str | None = None,
        status_group: str = "all",
    ):
        assert user_id == 1
        assert search == "abc"
        assert status_group == "active"
        return 2

    monkeypatch.setattr(scan_service, "delete_scans", _fake_delete_scans)

    response = await async_client.delete("/api/v1/scans?search=abc&status_group=active")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["data"]["deleted"] == 2
