from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints.scans import router as scans_router
from app.core.deps import CurrentUser, get_current_user, get_db
from app.models.scan import ModuleStatus, ScanStatus
from app.services.security_analyzer import compute_security_score


@pytest.mark.asyncio
@pytest.mark.integration
async def test_scan_detail_stays_renderable_with_partial_module_failures(monkeypatch):
    scan_id = UUID("11111111-1111-1111-1111-111111111111")

    fake_scan = SimpleNamespace(
        id=scan_id,
        domain="example.com",
        url="https://example.com",
        started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        completed_at=datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc),
        status=ScanStatus.COMPLETED,
        security_score=42,
        module_results=[
            SimpleNamespace(
                module_name="whois",
                status=ModuleStatus.FAILED,
                raw_result={"error": "whois timeout"},
                error_message="whois timeout",
            ),
            SimpleNamespace(
                module_name="ports",
                status=ModuleStatus.SUCCESS,
                raw_result={"openPorts": [80], "failedPorts": []},
                error_message=None,
            ),
            SimpleNamespace(
                module_name="features",
                status=ModuleStatus.TIMEOUT,
                raw_result={"error": "features module timeout"},
                error_message=None,
            ),
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    async def _fake_get_db():
        yield None

    async def _fake_user():
        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    from app.services import scan_service

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    app = FastAPI()
    app.include_router(scans_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[get_current_user] = _fake_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/scans/{scan_id}/detail")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"

    data = payload["data"]

    assert data["whois"] is not None
    assert data["ports"] is not None
    assert data["features"] is not None

    module_errors = data["moduleErrors"]
    assert "whois" in module_errors
    assert "features" in module_errors
    assert "ports" not in module_errors
    assert module_errors["whois"]["message"] == "whois timeout"
    assert module_errors["features"]["status"] == "timeout"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_scan_detail_derives_security_score_when_db_column_null(monkeypatch):
    """GET /detail derives security score from raw modules when DB column was never set."""
    scan_id = UUID("22222222-2222-2222-2222-222222222222")

    ports_raw = {"openPorts": [80, 443], "failedPorts": []}
    fake_scan = SimpleNamespace(
        id=scan_id,
        domain="derive.test",
        url="https://derive.test",
        started_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        completed_at=datetime(2026, 2, 1, 0, 0, 3, tzinfo=timezone.utc),
        status=ScanStatus.COMPLETED,
        security_score=None,
        module_results=[
            SimpleNamespace(
                module_name="ports",
                status=ModuleStatus.SUCCESS,
                raw_result=ports_raw,
                error_message=None,
            ),
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    async def _fake_get_db():
        yield None

    async def _fake_user():
        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    from app.services import scan_service

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    app = FastAPI()
    app.include_router(scans_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[get_current_user] = _fake_user

    expected = compute_security_score({"ports": ports_raw})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/scans/{scan_id}/detail")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["securityScore"] == expected
    assert "securityScoreBreakdown" in data
    sb = data["securityScoreBreakdown"]
    assert "baseScore" in sb and "confidence" in sb
    assert "severityCapApplied" in sb
    cs = sb["categoryScores"]
    for k in (
        "transport",
        "httpSecurity",
        "threatIntel",
        "infrastructure",
        "bestPractices",
    ):
        assert k in cs
        assert isinstance(cs[k], (int, float))


@pytest.mark.asyncio
@pytest.mark.integration
async def test_scan_detail_includes_shared_recommendations(monkeypatch):
    """``GET /scans/{id}/detail`` must surface the same recommendations payload.

    Guards against drift between the live web summary and the offline PDF/MD
    report: both consume ``services/recommendations.generate_recommendations``
    so the user sees identical actionable advice in either context.
    """
    scan_id = UUID("44444444-4444-4444-4444-444444444444")

    fake_scan = SimpleNamespace(
        id=scan_id,
        domain="rec.test",
        url="https://rec.test",
        started_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        completed_at=datetime(2026, 4, 1, 0, 0, 4, tzinfo=timezone.utc),
        status=ScanStatus.COMPLETED,
        security_score=42,
        module_results=[
            SimpleNamespace(
                module_name="ports",
                status=ModuleStatus.SUCCESS,
                # Includes a dangerous public port -> triggers a critical recommendation.
                raw_result={"openPorts": [{"port": 21}, {"port": 443}], "failedPorts": []},
                error_message=None,
            ),
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    async def _fake_get_db():
        yield None

    async def _fake_user():
        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    from app.services import scan_service

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    app = FastAPI()
    app.include_router(scans_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[get_current_user] = _fake_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/scans/{scan_id}/detail")

    assert response.status_code == 200
    data = response.json()["data"]
    assert "recommendations" in data
    items = data["recommendations"]
    assert isinstance(items, list)
    assert items, "expected at least one recommendation when dangerous port is open"
    titles = [item["title"] for item in items]
    assert "Restrict dangerous public ports" in titles
    for item in items:
        assert {"severity", "title", "description"} <= set(item.keys())


@pytest.mark.asyncio
@pytest.mark.integration
async def test_scan_detail_security_score_null_while_running(monkeypatch):
    scan_id = UUID("33333333-3333-3333-3333-333333333333")

    fake_scan = SimpleNamespace(
        id=scan_id,
        domain="running.test",
        url="https://running.test",
        started_at=datetime(2026, 2, 2, tzinfo=timezone.utc),
        completed_at=None,
        status=ScanStatus.RUNNING,
        security_score=None,
        module_results=[
            SimpleNamespace(
                module_name="ports",
                status=ModuleStatus.SUCCESS,
                raw_result={"openPorts": [443]},
                error_message=None,
            ),
        ],
    )

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return fake_scan

    async def _fake_get_db():
        yield None

    async def _fake_user():
        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    from app.services import scan_service

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)

    app = FastAPI()
    app.include_router(scans_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[get_current_user] = _fake_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/scans/{scan_id}/detail")

    assert response.status_code == 200
    assert response.json()["data"]["securityScore"] is None
