"""Unit tests for rescan service and API."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotRescannableError, ScanNotFoundError
from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.fixture(autouse=True)
def stub_redis_for_rescan(monkeypatch):
    """rescan clears Redis; stub so tests do not require a live Redis."""
    client = AsyncMock()
    client.delete = AsyncMock(return_value=0)
    client.aclose = AsyncMock(return_value=None)

    async def _factory():
        return client

    monkeypatch.setattr(scan_service, "get_redis_async", _factory)
    return client


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_running_scan_raises_409(monkeypatch) -> None:
    """Rescan a running scan raises ScanNotRescannableError."""
    running_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.RUNNING,
        url="https://example.com",
        domain="example.com",
    )

    async def _fake_get_scan(_db, scan_id):
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    class FakeDb:
        pass

    with pytest.raises(ScanNotRescannableError) as exc_info:
        await scan_service.rescan(FakeDb(), running_scan.id, None)

    assert exc_info.value.status_code == 409
    assert "SCAN_NOT_RESCANNABLE" in exc_info.value.code


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_pending_scan_raises_409(monkeypatch) -> None:
    """Rescan a pending scan raises ScanNotRescannableError."""
    pending_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.PENDING,
        url="https://example.com",
    )

    async def _fake_get_scan(_db, scan_id):
        return pending_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    class FakeDb:
        pass

    with pytest.raises(ScanNotRescannableError):
        await scan_service.rescan(FakeDb(), pending_scan.id, None)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_nonexistent_scan_raises_404(monkeypatch) -> None:
    """Rescan nonexistent scan raises ScanNotFoundError."""
    async def _fake_get_scan(_db, scan_id):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    class FakeDb:
        pass

    with pytest.raises(ScanNotFoundError):
        await scan_service.rescan(FakeDb(), uuid4(), None)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_api_endpoint_responds(async_client, monkeypatch) -> None:
    """Rescan endpoint is registered and returns 404 for nonexistent scan."""
    async def _fake_get_scan(_db, scan_id):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    response = await async_client.post(
        "/api/v1/scans/00000000-0000-0000-0000-000000000000/rescan"
    )
    assert response.status_code == 404


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_completed_scan_resets_in_place(monkeypatch) -> None:
    """Rescan a completed scan resets the same scan record in-place."""
    completed_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.COMPLETED,
        url="https://example.com",
        domain="example.com",
        module_results=[],
    )

    async def _fake_get_scan(_db, scan_id):
        return completed_scan

    class FakeDb:
        def add(self, x):
            pass

        async def delete(self, x):
            pass

        async def flush(self):
            pass

    def _fake_delay(scan_id, modules_filter=None, scan_options=None):
        return SimpleNamespace(id="task-123")

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(scan_service.execute_scan, "delay", _fake_delay)
    monkeypatch.setattr(
        scan_service,
        "settings",
        SimpleNamespace(APP_ENV="production"),
    )

    result = await scan_service.rescan(FakeDb(), completed_scan.id, None)
    assert result.id == completed_scan.id
    assert result.url == "https://example.com"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_failed_scan_resets_in_place(monkeypatch) -> None:
    """Rescan a failed scan resets the same scan record in-place."""
    failed_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.FAILED,
        url="https://example.com",
        domain="example.com",
        module_results=[],
    )

    async def _fake_get_scan(_db, scan_id):
        return failed_scan

    class FakeDb:
        def add(self, x):
            pass

        async def delete(self, x):
            pass

        async def flush(self):
            pass

    def _fake_delay(scan_id, modules_filter=None, scan_options=None):
        return SimpleNamespace(id="task-456")

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(scan_service.execute_scan, "delay", _fake_delay)
    monkeypatch.setattr(
        scan_service,
        "settings",
        SimpleNamespace(APP_ENV="production"),
    )

    result = await scan_service.rescan(FakeDb(), failed_scan.id, None)
    assert result.id == failed_scan.id


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_deletes_stale_cancel_and_progress_keys(
    monkeypatch, stub_redis_for_rescan
) -> None:
    """After cancel, rescan must remove cancel_requested so execute_scan can run."""
    cancelled_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.CANCELLED,
        url="https://bilibili.com",
        domain="bilibili.com",
        module_results=[],
    )

    async def _fake_get_scan(_db, scan_id):
        return cancelled_scan

    class FakeDb:
        def add(self, x):
            pass

        async def delete(self, x):
            pass

        async def flush(self):
            pass

    def _fake_delay(scan_id, modules_filter=None, scan_options=None):
        return SimpleNamespace(id="task-cancel-recovery")

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(scan_service.execute_scan, "delay", _fake_delay)
    monkeypatch.setattr(
        scan_service,
        "settings",
        SimpleNamespace(APP_ENV="production"),
    )

    await scan_service.rescan(FakeDb(), cancelled_scan.id, None)

    stub_redis_for_rescan.delete.assert_called_once()
    keys = stub_redis_for_rescan.delete.call_args[0]
    assert f"scan:{cancelled_scan.id}:progress" in keys
    assert f"scan:{cancelled_scan.id}:cancel_requested" in keys
