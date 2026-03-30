"""Integration-style tests for monitors API (mocked service layer)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.schemas.monitor import MonitorResponse
from app.core.deps import CurrentUser, get_current_user
from app.services import monitor_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_monitors_success(async_client, monkeypatch) -> None:
    mid = uuid4()
    now = datetime.now(timezone.utc)
    fake = MonitorResponse(
        id=str(mid),
        display_name="API",
        url="https://example.com",
        enabled_capabilities=["uptime_only"],
        capabilities={},
        capability_statuses=[],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status="up",
        last_check_at=now,
        last_status_code=200,
        last_response_time_ms=50.0,
        last_change_detected_at=None,
        ssl_expiry_days=None,
        total_checks=10,
        consecutive_failures=0,
        uptime_percentage=99.9,
        avg_response_time_ms=55.0,
        last_success=True,
        tags=[],
        created_at=now,
        updated_at=now,
    )

    async def _list(*_a, **_kw):
        return [fake], {"page": 1, "limit": 20, "total": 1}

    monkeypatch.setattr(monitor_service, "list_monitors", _list)
    r = await async_client.get("/api/v1/monitors")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["data"][0]["displayName"] == "API"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_monitors_401_without_user(test_app) -> None:
    test_app.dependency_overrides.pop(get_current_user, None)

    async def _reject():
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Not authenticated")

    test_app.dependency_overrides[get_current_user] = _reject
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        r = await client.get("/api/v1/monitors")
    assert r.status_code == 401

    async def _ok_user():
        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    test_app.dependency_overrides[get_current_user] = _ok_user


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pause_resume(async_client, monkeypatch) -> None:
    mid = uuid4()
    now = datetime.now(timezone.utc)

    async def _pause(i, uid, db):
        return MonitorResponse(
            id=str(i),
            display_name="x",
            url="https://example.com",
            enabled_capabilities=["uptime_only"],
            capabilities={},
            capability_statuses=[],
            interval_seconds=300,
            http_method="GET",
            expected_status_code=None,
            is_enabled=False,
            status="paused",
            last_check_at=None,
            last_status_code=None,
            last_response_time_ms=None,
            last_change_detected_at=None,
            ssl_expiry_days=None,
            total_checks=0,
            consecutive_failures=0,
            uptime_percentage=None,
            avg_response_time_ms=None,
            last_success=None,
            tags=[],
            created_at=now,
            updated_at=now,
        )

    monkeypatch.setattr(monitor_service, "pause_monitor", _pause)
    r = await async_client.patch(f"/api/v1/monitors/{mid}/pause")
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "paused"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_trigger_check_rate_limit(async_client, monkeypatch) -> None:
    from app.core.exceptions import AppException

    mid = uuid4()

    async def _boom(*_a, **_kw):
        raise AppException(
            code="MONITOR_CHECK_COOLDOWN",
            message="wait",
            status_code=429,
        )

    monkeypatch.setattr(monitor_service, "trigger_manual_check", _boom)
    r = await async_client.post(f"/api/v1/monitors/{mid}/check")
    assert r.status_code == 429
