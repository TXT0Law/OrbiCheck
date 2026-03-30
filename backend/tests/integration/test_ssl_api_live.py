"""Tests for GET /monitors/{id}/ssl?live=true rate limiting."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.router import api_v1_router
from app.api.v1.schemas.monitor import MonitorSslStatusResponse
from app.core.deps import CurrentUser, get_current_user, get_db, get_redis
from app.core.exceptions import register_exception_handlers
from app.services import monitor_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ssl_live_second_request_rate_limited(monkeypatch) -> None:
    """Use one shared in-memory Redis so the cooldown key survives across requests."""
    mid = uuid4()
    now = datetime.now(timezone.utc)

    class _SharedRedis:
        def __init__(self) -> None:
            self._kv: dict[str, str] = {}

        async def exists(self, key: str) -> bool:
            return key in self._kv

        async def setex(self, key: str, _ttl: int, value: str) -> None:
            self._kv[key] = value

        async def publish(self, *_a, **_kw) -> int:
            return 0

        def pubsub(self):
            raise NotImplementedError

        async def aclose(self) -> None:
            return None

    shared = _SharedRedis()

    async def _live_ok(*_a, **_kw):
        return MonitorSslStatusResponse(
            days_remaining=50,
            expiry_date="2030-01-01T00:00:00+00:00",
            issuer="CN=i",
            subject="CN=s",
            is_valid=True,
            severity_level="ok",
            is_expiring_soon=False,
            is_expired=False,
            subject_alternative_names=[],
            chain_summary=[],
            last_checked_at=now,
            serial_number=None,
            signature_algorithm=None,
            sha256_fingerprint=None,
            error=None,
            valid_from="",
            valid_to="",
        )

    monkeypatch.setattr(monitor_service, "get_ssl_status", _live_ok)

    from tests.conftest import _FakeDbSession

    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(api_v1_router, prefix="/api/v1")

    async def _db():
        yield _FakeDbSession()

    async def _redis():
        yield shared  # type: ignore[misc]

    async def _user():
        return CurrentUser(
            id=1,
            email="admin@orbicheck.local",
            csrf_token="csrf-token",
        )

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_redis] = _redis
    app.dependency_overrides[get_current_user] = _user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        r1 = await client.get(f"/api/v1/monitors/{mid}/ssl?live=true")
        assert r1.status_code == 200
        r2 = await client.get(f"/api/v1/monitors/{mid}/ssl?live=true")
    assert r2.status_code == 429
    assert r2.json()["error"]["code"] == "SSL_PROBE_RATE_LIMITED"
