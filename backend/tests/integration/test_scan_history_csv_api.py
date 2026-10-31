"""Scan history CSV API request validation and owner scope."""

from __future__ import annotations

import pytest

from app.services import scan_service


@pytest.mark.integration
@pytest.mark.asyncio
async def test_scan_history_csv_export_passes_validated_filters(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, object] = {}

    async def fake_export(_db: object, **kwargs: object) -> tuple[str, int]:
        captured.update(kwargs)
        return "\ufeffid,domain\r\n", 12

    monkeypatch.setattr(scan_service, "export_scan_history_csv", fake_export)
    response = await async_client.get(
        "/api/v1/scans/export.csv?limit=5&offset=10&search=example"
        "&sort_by=domain_asc&status_group=completed"
    )

    assert response.status_code == 200
    assert response.text == "\ufeffid,domain\r\n"
    assert response.headers["content-disposition"] == 'attachment; filename="scan-history.csv"'
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-export-total"] == "12"
    assert response.headers["x-export-offset"] == "10"
    assert captured == {
        "user_id": 1,
        "limit": 5,
        "offset": 10,
        "search": "example",
        "sort_by": "domain_asc",
        "status_group": "completed",
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_scan_history_csv_export_rejects_out_of_range_limit(async_client) -> None:
    response = await async_client.get(
        f"/api/v1/scans/export.csv?limit={scan_service.SCAN_EXPORT_MAX_ROWS + 1}"
    )

    assert response.status_code == 422
