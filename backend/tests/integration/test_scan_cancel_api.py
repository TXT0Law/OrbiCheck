from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotCancellableError, ScanNotFoundError
from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancel_pending_scan_returns_cancelled_scan(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    scan_record_factory,
) -> None:
    scan = scan_record_factory(status=ScanStatus.CANCELLED, progress=10, completed_modules=1)

    async def _fake_cancel_scan(_db, scan_id, user_id=None):
        assert user_id == 1
        assert scan_id == scan.id
        return scan

    monkeypatch.setattr(scan_service, "cancel_scan", _fake_cancel_scan)
    response = await async_client.post(f"/api/v1/scans/{scan.id}/cancel")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["id"] == str(scan.id)
    assert payload["status"] == "cancelled"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancel_completed_scan_returns_409(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()

    async def _fake_cancel_scan(_db, _scan_id, user_id=None):
        raise ScanNotCancellableError(str(scan_id), "completed")

    monkeypatch.setattr(scan_service, "cancel_scan", _fake_cancel_scan)
    response = await async_client.post(f"/api/v1/scans/{scan_id}/cancel")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SCAN_NOT_CANCELLABLE"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancel_nonexistent_scan_returns_404(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()

    async def _fake_cancel_scan(_db, _scan_id, user_id=None):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "cancel_scan", _fake_cancel_scan)
    response = await async_client.post(f"/api/v1/scans/{scan_id}/cancel")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCAN_NOT_FOUND"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_scan_after_cancel_returns_cancelled_status(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    scan_record_factory,
) -> None:
    scan = scan_record_factory(status=ScanStatus.CANCELLED, progress=55, completed_modules=2)

    async def _fake_get_scan(_db, scan_id, user_id=None):
        assert user_id == 1
        assert scan_id == scan.id
        return scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    response = await async_client.get(f"/api/v1/scans/{scan.id}")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["status"] == "cancelled"
    assert payload["completedModules"] == 2
