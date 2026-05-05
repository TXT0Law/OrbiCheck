"""Integration tests for ``GET /scans/{scan_id}/detail/full`` (T4.1).

The endpoint must return the same transformed summary as ``/detail`` plus a
``rawResults`` map keyed by module name. Owner enforcement is delegated to
``scan_service.get_scan``: non-owners receive 404 (the service raises
``ScanNotFoundError`` when the user_id filter does not match).
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service


def _fake_module(module: str, *, raw: dict | None, status: ModuleStatus) -> SimpleNamespace:
    return SimpleNamespace(
        module_name=module,
        status=status,
        raw_result=raw,
        error_message=None,
        duration_ms=123,
        completed_at=datetime.now(timezone.utc),
    )


def _fake_scan(scan_id: UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=scan_id,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        security_score=72,
        progress=100,
        total_modules=2,
        completed_modules=2,
        error_message=None,
        started_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        completed_at=datetime(2026, 5, 1, 0, 0, 5, tzinfo=timezone.utc),
        created_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        module_results=[
            _fake_module(
                "whois",
                raw={"registrar": "Example Registrar", "nameServers": ["ns1.example.com"]},
                status=ModuleStatus.SUCCESS,
            ),
            _fake_module(
                "ports",
                raw={"openPorts": [80, 443], "failedPorts": []},
                status=ModuleStatus.SUCCESS,
            ),
        ],
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_export_returns_summary_and_raw_results(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    fake = _fake_scan(scan_id)

    async def _get_scan(_db, _scan_id, user_id=None):
        # Owner enforcement: simulate the production filter by id+user_id.
        assert user_id == 1, "endpoint must pass current_user.id"
        return fake

    monkeypatch.setattr(scan_service, "get_scan", _get_scan)

    response = await async_client.get(f"/api/v1/scans/{scan_id}/detail/full")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"

    data = body["data"]
    assert set(data.keys()) >= {"summary", "rawResults", "exportedAt"}
    assert data["summary"]["domain"] == "example.com"
    assert data["summary"]["securityScore"] is not None
    assert data["summary"]["url"] == "https://example.com"
    # Same severity / categorySummary keys the dashboard reads.
    assert "severity" in data["summary"]
    assert "categorySummary" in data["summary"]

    raw = data["rawResults"]
    assert set(raw.keys()) == {"whois", "ports"}
    assert raw["whois"]["status"] == "success"
    assert raw["whois"]["rawResult"]["registrar"] == "Example Registrar"
    assert raw["ports"]["rawResult"]["openPorts"] == [80, 443]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_export_404_for_non_owner(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()

    async def _get_scan(_db, _scan_id, user_id=None):
        # Mimic scan_service: when user_id mismatch the filtered query yields
        # nothing and the service raises ScanNotFoundError (404).
        raise ScanNotFoundError(str(_scan_id))

    monkeypatch.setattr(scan_service, "get_scan", _get_scan)

    response = await async_client.get(f"/api/v1/scans/{scan_id}/detail/full")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCAN_NOT_FOUND"
