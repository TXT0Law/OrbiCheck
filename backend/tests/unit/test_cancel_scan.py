"""Unit tests for cancel_scan service and endpoint."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotCancellableError, ScanNotFoundError
from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.fixture(autouse=True)
def stub_redis_for_cancel(monkeypatch):
    """cancel_scan always touches Redis; stub for all tests in this module."""
    client = AsyncMock()
    client.get = AsyncMock(return_value=None)
    client.set = AsyncMock(return_value=True)
    client.expire = AsyncMock(return_value=True)
    client.aclose = AsyncMock(return_value=None)

    async def _factory():
        return client

    monkeypatch.setattr(scan_service, "get_redis_async", _factory)
    return client


@pytest.fixture
def mock_db():
    """Async session mock with flush and commit."""
    from unittest.mock import AsyncMock

    db = AsyncMock()
    db.flush = AsyncMock(return_value=None)
    db.commit = AsyncMock(return_value=None)
    db.refresh = AsyncMock(return_value=None)
    db.delete = AsyncMock(return_value=None)
    return db


@pytest.fixture
def pending_scan():
    """Scan with PENDING status, no celery_task_id."""
    return SimpleNamespace(
        id=uuid4(),
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.PENDING,
        celery_task_id=None,
        completed_at=None,
        progress=0,
        completed_modules=0,
        total_modules=28,
        module_results=[],
    )


@pytest.fixture
def running_scan():
    """Scan with RUNNING status and celery_task_id."""
    return SimpleNamespace(
        id=uuid4(),
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.RUNNING,
        celery_task_id="abc-123-task-id",
        completed_at=None,
        progress=50,
        completed_modules=10,
        total_modules=28,
        module_results=[],
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_pending_scan_sets_status_cancelled(
    mock_db, pending_scan, monkeypatch
):
    """Cancel PENDING scan sets status to CANCELLED and completed_at."""
    async def fake_get_scan(db, sid):
        return pending_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    result = await scan_service.cancel_scan(mock_db, pending_scan.id)

    assert result.status == ScanStatus.CANCELLED
    assert result.completed_at is not None
    assert result.id == pending_scan.id


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_running_scan_revokes_celery_task(
    mock_db, running_scan, monkeypatch
):
    """Cancel RUNNING scan with task_id revokes Celery task."""
    revoke_called = []

    def recording_revoke(task_id, terminate=True, signal="SIGTERM"):
        revoke_called.append((task_id, terminate, signal))

    async def fake_get_scan(db, sid):
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(
        scan_service.celery_app.control,
        "revoke",
        recording_revoke,
    )

    result = await scan_service.cancel_scan(mock_db, running_scan.id)
    assert result.status == ScanStatus.CANCELLED
    assert len(revoke_called) == 1
    assert revoke_called[0][0] == "abc-123-task-id"
    assert revoke_called[0][1] is True
    assert revoke_called[0][2] == "SIGTERM"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_completed_scan_returns_409(mock_db, monkeypatch):
    """Cancel COMPLETED scan raises ScanNotCancellableError."""
    completed_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.COMPLETED,
        celery_task_id=None,
    )
    async def fake_get_scan(db, sid):
        return completed_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    with pytest.raises(ScanNotCancellableError) as exc_info:
        await scan_service.cancel_scan(mock_db, completed_scan.id)

    assert exc_info.value.code == "SCAN_NOT_CANCELLABLE"
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_already_cancelled_scan_returns_409(mock_db, monkeypatch):
    """Cancel already CANCELLED scan raises ScanNotCancellableError."""
    cancelled_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.CANCELLED,
        celery_task_id=None,
    )
    async def fake_get_scan(db, sid):
        return cancelled_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    with pytest.raises(ScanNotCancellableError) as exc_info:
        await scan_service.cancel_scan(mock_db, cancelled_scan.id)

    assert exc_info.value.code == "SCAN_NOT_CANCELLABLE"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_failed_scan_returns_409(mock_db, monkeypatch):
    """Cancel FAILED scan raises ScanNotCancellableError."""
    failed_scan = SimpleNamespace(
        id=uuid4(),
        status=ScanStatus.FAILED,
        celery_task_id=None,
    )
    async def fake_get_scan(db, sid):
        return failed_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    with pytest.raises(ScanNotCancellableError):
        await scan_service.cancel_scan(mock_db, failed_scan.id)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_nonexistent_scan_returns_404(mock_db, monkeypatch):
    """Cancel non-existent scan raises ScanNotFoundError."""
    async def raise_not_found(db, scan_id):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "get_scan", raise_not_found)

    with pytest.raises(ScanNotFoundError) as exc_info:
        await scan_service.cancel_scan(mock_db, uuid4())

    assert exc_info.value.code == "SCAN_NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_succeeds_even_if_revoke_fails(
    mock_db, running_scan, monkeypatch
):
    """Cancel still sets CANCELLED when Celery revoke fails."""
    def failing_revoke(*args, **kwargs):
        raise RuntimeError("Worker unreachable")

    async def fake_get_scan(db, sid):
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(
        scan_service.celery_app.control,
        "revoke",
        failing_revoke,
    )

    result = await scan_service.cancel_scan(mock_db, running_scan.id)
    assert result.status == ScanStatus.CANCELLED


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_scan_without_task_id_skips_revoke(
    mock_db, pending_scan, monkeypatch
):
    """Cancel PENDING scan without task_id does not call revoke."""
    revoke_called = []

    def tracking_revoke(*args, **kwargs):
        revoke_called.append(True)

    async def fake_get_scan(db, sid):
        return pending_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(
        scan_service.celery_app.control,
        "revoke",
        tracking_revoke,
    )

    result = await scan_service.cancel_scan(mock_db, pending_scan.id)
    assert result.status == ScanStatus.CANCELLED
    assert len(revoke_called) == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_preserves_partial_results(mock_db, running_scan, monkeypatch):
    """Cancel does not delete scan or module_results."""
    fake_result = SimpleNamespace(module_name="dns", raw_result={"records": []})
    running_scan.module_results = [fake_result]

    async def fake_get_scan(db, sid):
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)

    result = await scan_service.cancel_scan(mock_db, running_scan.id)

    assert result.status == ScanStatus.CANCELLED
    assert len(result.module_results) == 1
    assert result.module_results[0].module_name == "dns"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_scan_writes_redis_terminal_and_cancel_flag(
    mock_db, running_scan, monkeypatch, stub_redis_for_cancel
):
    """Redis gets cancelled progress payload and cancel_requested flag."""
    async def fake_get_scan(db, sid):
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(
        scan_service.celery_app.control,
        "revoke",
        lambda *a, **k: None,
    )

    await scan_service.cancel_scan(mock_db, running_scan.id)

    set_calls = [c.args for c in stub_redis_for_cancel.set.call_args_list]
    progress_writes = [args for args in set_calls if "progress" in str(args[0])]
    assert progress_writes, "expected progress key write"
    key, raw = progress_writes[0][0], progress_writes[0][1]
    assert str(running_scan.id) in key
    payload = json.loads(raw)
    assert payload["phase"] == "cancelled"
    assert payload["cancelled"] is True
    assert payload["progress"] == 50
    assert payload["completedModules"] == 10
    assert payload["totalModules"] == 28

    flag_writes = [
        args for args in set_calls if "cancel_requested" in str(args[0])
    ]
    assert flag_writes
    assert flag_writes[0][1] == "1"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_scan_merges_existing_redis_progress(
    mock_db, running_scan, monkeypatch, stub_redis_for_cancel
):
    """Prefer last known progress from Redis when present."""
    stub_redis_for_cancel.get = AsyncMock(
        return_value=json.dumps(
            {
                "progress": 72,
                "phase": "medium",
                "completedModules": 20,
                "totalModules": 24,
            }
        )
    )

    async def fake_get_scan(db, sid):
        running_scan.progress = 10
        running_scan.completed_modules = 1
        running_scan.total_modules = 99
        return running_scan

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(
        scan_service.celery_app.control,
        "revoke",
        lambda *a, **k: None,
    )

    await scan_service.cancel_scan(mock_db, running_scan.id)

    raw = stub_redis_for_cancel.set.call_args_list[0].args[1]
    payload = json.loads(raw)
    assert payload["progress"] == 72
    assert payload["completedModules"] == 20
    assert payload["totalModules"] == 24


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cancel_scan_db_succeeds_when_redis_unreachable(
    mock_db, running_scan, monkeypatch
):
    """CANCELLED must be persisted even if Redis is down (user can delete/rescan)."""

    async def fake_get_scan(db, sid):
        return running_scan

    async def redis_down():
        raise ConnectionError("redis unreachable")

    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(
        scan_service.celery_app.control,
        "revoke",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(scan_service, "get_redis_async", redis_down)

    result = await scan_service.cancel_scan(mock_db, running_scan.id)
    assert result.status == ScanStatus.CANCELLED
    assert result.completed_at is not None
