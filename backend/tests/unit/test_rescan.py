"""Unit tests for rescan service and API."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Delete, Update

from app.core.exceptions import ScanNotRescannableError, ScanNotFoundError
from app.models.scan import Scan, ScanStatus
from app.services import scan_service

TEST_USER_ID = 7


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rescan_scan_lookup_locks_owner_scoped_row_before_events() -> None:
    scan = Scan(
        id=uuid4(),
        user_id=TEST_USER_ID,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: scan))
    )

    assert await scan_service.get_scan(db, scan.id, TEST_USER_ID, for_update=True) is scan
    query = db.execute.await_args.args[0]
    sql = str(query.compile(dialect=postgresql.dialect()))
    assert "scans.user_id =" in sql
    assert "FOR UPDATE OF scans" in sql
    assert query._execution_options["populate_existing"]


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

    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
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

    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
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
    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
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
    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
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
        finding_observations_projected_at=datetime.now(timezone.utc),
        finding_ruleset_version=1,
        finding_observations_projection_failed_at=datetime.now(timezone.utc),
    )

    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
        return completed_scan

    class FakeDb:
        def __init__(self) -> None:
            self.statements: list[object] = []

        async def execute(self, statement: object) -> None:
            self.statements.append(statement)

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

    db = FakeDb()
    result = await scan_service.rescan(db, completed_scan.id, None)
    assert result.id == completed_scan.id
    assert result.url == "https://example.com"
    assert result.finding_observations_projected_at is None
    assert result.finding_ruleset_version is None
    assert result.finding_observations_projection_failed_at is None
    assert len(db.statements) == 2
    event_update, finding_delete = db.statements
    assert isinstance(event_update, Update)
    assert event_update.table.name == "scan_risk_notification_events"
    assert "scan_risk_notification_events.status IN" in str(event_update)
    params = event_update.compile().params
    assert completed_scan.id in params.values()
    assert params["status"] == "cancelled"
    assert set(params["status_1"]) == {"pending", "claimed"}
    assert params["claim_token"] is None
    assert params["claim_expires_at"] is None
    assert isinstance(finding_delete, Delete)
    assert finding_delete.table.name == "scan_finding_observations"
    assert completed_scan.id in finding_delete.compile().params.values()


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

    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
        return failed_scan

    class FakeDb:
        async def execute(self, statement: object) -> None:
            pass

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

    async def _fake_get_scan(_db, scan_id, _user_id=None, *, for_update=False):
        assert for_update
        return cancelled_scan

    class FakeDb:
        async def execute(self, statement: object) -> None:
            pass

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
