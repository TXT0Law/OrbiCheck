"""Integration-style tests for GET /monitors/{id}/ssl."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.schemas.monitor import MonitorSslStatusResponse
from app.core.deps import get_current_user
from app.core.exceptions import SslNotEnabledException
from app.services import monitor_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_ssl_requires_auth(test_app) -> None:
    test_app.dependency_overrides.pop(get_current_user, None)

    from fastapi import HTTPException

    async def _reject():
        raise HTTPException(status_code=401, detail="nope")

    test_app.dependency_overrides[get_current_user] = _reject
    mid = uuid4()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        r = await client.get(f"/api/v1/monitors/{mid}/ssl")
    assert r.status_code == 401

    async def _ok():
        from app.core.deps import CurrentUser

        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    test_app.dependency_overrides[get_current_user] = _ok


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_ssl_not_enabled_returns_400(async_client, monkeypatch) -> None:
    mid = uuid4()

    async def _raise(*_a, **_kw):
        raise SslNotEnabledException()

    monkeypatch.setattr(monitor_service, "get_ssl_status", _raise)
    r = await async_client.get(f"/api/v1/monitors/{mid}/ssl")
    assert r.status_code == 400
    body = r.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "SSL_NOT_ENABLED"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_ssl_success_shape(async_client, monkeypatch) -> None:
    mid = uuid4()
    now = datetime.now(timezone.utc)

    async def _ok(*_a, **_kw):
        return MonitorSslStatusResponse(
            days_remaining=10,
            expiry_date="2030-01-01T00:00:00+00:00",
            issuer="CN=i",
            subject="CN=s",
            is_valid=True,
            severity_level="ok",
            is_expiring_soon=False,
            is_expired=False,
            subject_alternative_names=["a"],
            chain_summary=[],
            last_checked_at=now,
            serial_number="1",
            signature_algorithm="sha256",
            sha256_fingerprint="AA",
            error=None,
            valid_from="2025-01-01T00:00:00+00:00",
            valid_to="2030-01-01T00:00:00+00:00",
        )

    monkeypatch.setattr(monitor_service, "get_ssl_status", _ok)
    r = await async_client.get(f"/api/v1/monitors/{mid}/ssl")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["daysRemaining"] == 10
    assert data["severityLevel"] == "ok"
