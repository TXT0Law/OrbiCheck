from __future__ import annotations

import pytest

from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_scans_returns_limit_offset_and_status_group(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    scan_record_factory,
) -> None:
    rows = [
        scan_record_factory(status=ScanStatus.COMPLETED, progress=100, completed_modules=3),
        scan_record_factory(status=ScanStatus.COMPLETED, progress=100, completed_modules=3),
    ]

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
        assert limit == 5
        assert offset == 10
        assert status_group == "completed"
        return rows, 12

    monkeypatch.setattr(scan_service, "list_scans", _fake_list_scans)
    response = await async_client.get(
        "/api/v1/scans?limit=5&offset=10&status_group=completed"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["total"] == 12
    assert len(payload["data"]["scans"]) == 2
    assert payload["meta"]["limit"] == 5
    assert payload["meta"]["offset"] == 10
    assert payload["meta"]["statusGroup"] == "completed"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_scans_returns_empty_result_set(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_list_scans(*_args, **_kwargs):
        return [], 0

    monkeypatch.setattr(scan_service, "list_scans", _fake_list_scans)
    response = await async_client.get("/api/v1/scans?limit=10&offset=0")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["scans"] == []
    assert payload["data"]["total"] == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_scans_accepts_search_and_sort_parameters(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
        assert search == "example"
        assert sort_by == "domain_asc"
        return [], 0

    monkeypatch.setattr(scan_service, "list_scans", _fake_list_scans)
    response = await async_client.get(
        "/api/v1/scans?search=example&sort_by=domain_asc"
    )

    assert response.status_code == 200
    assert response.json()["meta"]["sortBy"] == "domain_asc"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_scans_rejects_invalid_status_group(async_client) -> None:
    response = await async_client.get("/api/v1/scans?status_group=invalid")

    assert response.status_code == 422
