from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError, ScanNotRescannableError
from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rescan_completed_scan_returns_reset_scan(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    scan_record_factory,
) -> None:
    scan = scan_record_factory(status=ScanStatus.PENDING, progress=0, completed_modules=0)

    async def _fake_rescan(_db, scan_id, background_tasks, user_id=None):
        assert user_id == 1
        assert scan_id == scan.id
        assert background_tasks is not None
        return scan

    monkeypatch.setattr(scan_service, "rescan", _fake_rescan)
    response = await async_client.post(f"/api/v1/scans/{scan.id}/rescan")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["id"] == str(scan.id)
    assert payload["status"] == "pending"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rescan_running_scan_returns_409(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()

    async def _fake_rescan(_db, _scan_id, _background_tasks, user_id=None):
        raise ScanNotRescannableError(str(scan_id), "running")

    monkeypatch.setattr(scan_service, "rescan", _fake_rescan)
    response = await async_client.post(f"/api/v1/scans/{scan_id}/rescan")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SCAN_NOT_RESCANNABLE"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rescan_nonexistent_scan_returns_404(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()

    async def _fake_rescan(_db, _scan_id, _background_tasks, user_id=None):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "rescan", _fake_rescan)
    response = await async_client.post(f"/api/v1/scans/{scan_id}/rescan")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCAN_NOT_FOUND"
