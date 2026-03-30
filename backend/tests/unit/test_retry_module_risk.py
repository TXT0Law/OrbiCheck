"""Unit tests for module retry and post-retry risk score refresh."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service
from app.services.security_analyzer import SecurityScoreResult


@pytest.mark.unit
@pytest.mark.asyncio
async def test_refresh_scan_security_score_persists_computed_value(monkeypatch) -> None:
    """After successful modules exist, refresh writes V2 security score to DB."""
    scan_id = uuid4()
    module_row = SimpleNamespace(
        module_name="ssl",
        status=ModuleStatus.SUCCESS,
        raw_result={"bits": 256, "validTo": "2099-01-01T00:00:00Z"},
    )
    scan_row = SimpleNamespace(id=scan_id, module_results=[module_row])

    class _SelectResult:
        def scalar_one_or_none(self):
            return scan_row

    calls: list[object] = []

    async def fake_execute(stmt):
        calls.append(stmt)
        if len(calls) == 1:
            return _SelectResult()
        return MagicMock()

    db = AsyncMock()
    db.execute = fake_execute
    db.commit = AsyncMock()

    def _fake_v2(_raw, _mods):
        return SecurityScoreResult(
            score=73,
            base_score=73.0,
            confidence=1.0,
            severity_cap_applied=None,
            category_scores={
                "transport": 0.0,
                "http_security": 0.0,
                "threat_intel": 0.0,
                "infrastructure": 0.0,
                "best_practices": 0.0,
            },
        )

    monkeypatch.setattr(scan_service, "compute_security_score_v2", _fake_v2)

    await scan_service._refresh_scan_security_score(db, scan_id)

    assert len(calls) == 2
    db.commit.assert_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_refresh_scan_security_score_no_op_without_success_raw(monkeypatch) -> None:
    """No successful dict raw rows -> no update or commit."""
    scan_id = uuid4()
    module_row = SimpleNamespace(
        module_name="ssl",
        status=ModuleStatus.FAILED,
        raw_result=None,
    )
    scan_row = SimpleNamespace(id=scan_id, module_results=[module_row])

    class _SelectResult:
        def scalar_one_or_none(self):
            return scan_row

    calls: list[object] = []

    async def fake_execute(stmt):
        calls.append(stmt)
        return _SelectResult()

    db = AsyncMock()
    db.execute = fake_execute
    db.commit = AsyncMock()

    spy = MagicMock()
    monkeypatch.setattr(scan_service, "compute_security_score_v2", spy)

    await scan_service._refresh_scan_security_score(db, scan_id)

    spy.assert_not_called()
    assert len(calls) == 1
    db.commit.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_module_invokes_risk_refresh(monkeypatch) -> None:
    """retry_module always awaits _refresh_scan_security_score after persisting module result."""
    scan_id = uuid4()
    ssl_row = SimpleNamespace(
        module_name="ssl",
        status=ModuleStatus.FAILED,
        raw_result=None,
        duration_ms=1,
        error_message="x",
        completed_at=None,
    )
    scan = SimpleNamespace(
        id=scan_id,
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        module_results=[ssl_row],
    )

    async def fake_get_scan(_db, sid):
        assert sid == scan_id
        return scan

    async def fake_call_scan_module(_name, _url):
        return {
            "status_code": 200,
            "data": {"success": True, "durationMs": 12},
        }

    refresh = AsyncMock()
    monkeypatch.setattr(scan_service, "get_scan", fake_get_scan)
    monkeypatch.setattr(scan_service, "call_scan_module", fake_call_scan_module)
    monkeypatch.setattr(scan_service, "_refresh_scan_security_score", refresh)

    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    await scan_service.retry_module(db, scan_id, "ssl")

    refresh.assert_awaited_once_with(db, scan_id)
    db.commit.assert_awaited()
