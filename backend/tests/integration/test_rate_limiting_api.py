from __future__ import annotations

from datetime import datetime, timezone
from time import sleep
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.deps import CurrentUser, get_current_user, get_db
from app.main import create_app
from app.models.scan import ScanStatus
from app.services import scan_service


class _FakeDb:
    async def commit(self) -> None:
        return None

    async def refresh(self, _obj: object) -> None:
        return None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rate_limit_returns_429_after_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.config.settings.RATE_LIMIT_WINDOW_SECONDS", 60)
    monkeypatch.setattr("app.core.config.settings.RATE_LIMIT_DEFAULT_REQUESTS", 2)

    async def _fake_list_scans(*_args, **_kwargs):
        return [], 0

    async def _fake_db():
        yield _FakeDb()

    async def _fake_user() -> CurrentUser:
        return CurrentUser(id=1, email="admin@orbicheck.local", csrf_token="csrf")

    monkeypatch.setattr(scan_service, "list_scans", _fake_list_scans)
    app = create_app()
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_current_user] = _fake_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.get("/api/v1/scans")
        second = await client.get("/api/v1/scans")
        third = await client.get("/api/v1/scans")

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "RATE_LIMITED"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rate_limit_resets_after_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.config.settings.RATE_LIMIT_WINDOW_SECONDS", 1)
    monkeypatch.setattr("app.core.config.settings.RATE_LIMIT_DEFAULT_REQUESTS", 1)
    monkeypatch.setattr("app.core.config.settings.RATE_LIMIT_SCAN_CREATE_REQUESTS", 1)

    scan = SimpleNamespace(
        id=uuid4(),
        url="https://example.com",
        domain="example.com",
        status=ScanStatus.PENDING,
        progress=0,
        total_modules=1,
        completed_modules=0,
        security_score=None,
        error_message=None,
        started_at=None,
        completed_at=None,
        created_at=datetime.now(timezone.utc),
        celery_task_id=None,
        module_results=[],
    )

    async def _fake_create_scan(*_args, **_kwargs):
        return scan

    async def _fake_db():
        yield _FakeDb()

    async def _fake_user() -> CurrentUser:
        return CurrentUser(id=1, email="admin@orbicheck.local", csrf_token="csrf")

    monkeypatch.setattr(scan_service, "create_scan", _fake_create_scan)
    monkeypatch.setattr(
        "app.api.v1.endpoints.scans.execute_scan.delay",
        lambda *_a, **_kw: None,
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.scans.execute_scan.run",
        lambda *_a, **_kw: None,
    )
    app = create_app()
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_current_user] = _fake_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        first = await client.post("/api/v1/scans", json={"url": "https://example.com"})
        second = await client.post("/api/v1/scans", json={"url": "https://example.com"})
        sleep(1.1)
        third = await client.post("/api/v1/scans", json={"url": "https://example.com"})

    assert first.status_code == 201
    assert second.status_code == 429
    assert third.status_code == 201
