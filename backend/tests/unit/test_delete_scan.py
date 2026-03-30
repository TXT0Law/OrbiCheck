"""Unit tests for delete_scan service."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.fixture(autouse=True)
def stub_redis_for_delete(monkeypatch):
    """delete_scan clears Redis keys; stub for tests."""
    client = AsyncMock()
    client.delete = AsyncMock(return_value=0)
    client.aclose = AsyncMock(return_value=None)

    async def _factory():
        return client

    monkeypatch.setattr(scan_service, "get_redis_async", _factory)
    return client


@pytest.fixture
def mock_db():
    """Async session mock."""
    from unittest.mock import AsyncMock

    db = AsyncMock()
    db.flush = AsyncMock(return_value=None)
    db.commit = AsyncMock(return_value=None)
    db.delete = AsyncMock(return_value=None)
    return db


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_completed_scan_removes_record(mock_db, monkeypatch):
    """Delete COMPLETED scan removes record."""
    completed_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.COMPLETED,
    )

    async def fake_get_scan(db, scan_id):
        if scan_id != completed_scan.id:
            raise ScanNotFoundError(str(scan_id))
        return completed_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    await scan_service.delete_scan(mock_db, completed_scan.id)

    mock_db.delete.assert_called_once_with(completed_scan)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_cancelled_scan_removes_record(mock_db, monkeypatch):
    """Delete CANCELLED scan removes record."""
    cancelled_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.CANCELLED,
    )

    async def fake_get_scan(db, sid):
        return cancelled_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    await scan_service.delete_scan(mock_db, cancelled_scan.id)

    mock_db.delete.assert_called_once_with(cancelled_scan)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_running_scan_removes_record(mock_db, monkeypatch, stub_redis_for_delete):
    """Delete RUNNING scan allowed (zombie after worker loss)."""
    running_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.RUNNING,
    )

    async def fake_get_scan(db, sid):
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    await scan_service.delete_scan(mock_db, running_scan.id)

    mock_db.delete.assert_called_once_with(running_scan)
    stub_redis_for_delete.delete.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_pending_scan_removes_record(mock_db, monkeypatch, stub_redis_for_delete):
    """Delete PENDING scan allowed."""
    pending_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.PENDING,
    )

    async def fake_get_scan(db, sid):
        return pending_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    await scan_service.delete_scan(mock_db, pending_scan.id)

    mock_db.delete.assert_called_once_with(pending_scan)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_failed_scan_removes_record(mock_db, monkeypatch):
    """Delete FAILED scan removes record."""
    failed_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.FAILED,
    )

    async def fake_get_scan(db, sid):
        return failed_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    await scan_service.delete_scan(mock_db, failed_scan.id)

    mock_db.delete.assert_called_once_with(failed_scan)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_delete_nonexistent_scan_returns_404(mock_db, monkeypatch):
    """Delete non-existent scan raises ScanNotFoundError."""

    async def raise_not_found(db, scan_id):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "get_scan", raise_not_found)

    with pytest.raises(ScanNotFoundError) as exc_info:
        await scan_service.delete_scan(mock_db, uuid4())

    assert exc_info.value.code == "SCAN_NOT_FOUND"
    mock_db.delete.assert_not_called()
