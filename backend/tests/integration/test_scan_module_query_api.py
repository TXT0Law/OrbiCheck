from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_scan_module_returns_transformed_module_data(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    fake_scan = SimpleNamespace(
        id=scan_id,
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.COMPLETED,
        security_score=None,
        progress=100,
        total_modules=1,
        completed_modules=1,
        error_message=None,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        module_results=[
            SimpleNamespace(
                module_name="whois",
                status=ModuleStatus.SUCCESS,
                raw_result={"registrar": "Example Registrar", "nameServers": ["ns1.example.com"]},
                error_message=None,
                duration_ms=123,
            )
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/modules/whois")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["module"] == "whois"
    assert payload["status"] == "success"
    assert payload["data"]["registrar"] == "Example Registrar"
    assert payload["durationMs"] == 123


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_scan_module_returns_none_for_missing_module(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    fake_scan = SimpleNamespace(
        id=scan_id,
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.COMPLETED,
        module_results=[],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/modules/dns")

    assert response.status_code == 200
    assert response.json()["data"] is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_scan_module_returns_pending_module_shape(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    fake_scan = SimpleNamespace(
        id=scan_id,
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.RUNNING,
        module_results=[
            SimpleNamespace(
                module_name="headers",
                status=ModuleStatus.PENDING,
                raw_result=None,
                error_message=None,
                duration_ms=None,
            )
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/modules/headers")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["module"] == "headers"
    assert payload["status"] == "pending"
    assert payload["data"]["overallGrade"] == "F"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_scan_module_includes_failed_module_error_info(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    fake_scan = SimpleNamespace(
        id=scan_id,
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.FAILED,
        module_results=[
            SimpleNamespace(
                module_name="social-tags",
                status=ModuleStatus.FAILED,
                raw_result={"error": "upstream timeout"},
                error_message="upstream timeout",
                duration_ms=999,
            )
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/modules/social-tags")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["status"] == "failed"
    assert payload["data"]["ogTitle"] is None
    assert payload["durationMs"] == 999
