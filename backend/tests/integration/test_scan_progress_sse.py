"""Integration tests for scan progress SSE terminal protocol."""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import scans as scans_endpoint
from app.services import scan_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_scan_progress_sse_yields_done_after_error_payload(
    async_client, monkeypatch
):
    scan_id = uuid.uuid4()
    error_raw = json.dumps(
        {
            "progress": 0,
            "phase": "error",
            "detail": "fatal",
            "completedModules": 0,
            "totalModules": 0,
            "error": True,
        }
    )

    class _FakeRedis:
        def __init__(self) -> None:
            self._calls = 0

        async def get(self, _key: str):
            self._calls += 1
            if self._calls >= 2:
                return error_raw
            return None

        async def expire(self, *_a, **_k):
            return True

        async def aclose(self) -> None:
            return None

    async def _fake_get_redis():
        return _FakeRedis()

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return object()

    monkeypatch.setattr(scans_endpoint, "get_redis_async", _fake_get_redis)
    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(asyncio, "sleep", AsyncMock(return_value=None))

    response = await async_client.get(f"/api/v1/scans/{scan_id}/progress")
    assert response.status_code == 200
    body = response.text
    assert "pending" in body
    compact = body.replace(" ", "")
    assert '"error":true' in compact
    assert '"done":true' in compact


@pytest.mark.asyncio
@pytest.mark.integration
async def test_scan_progress_sse_yields_done_after_cancelled_payload(
    async_client, monkeypatch
):
    scan_id = uuid.uuid4()
    cancel_raw = json.dumps(
        {
            "progress": 50,
            "phase": "cancelled",
            "detail": "Scan cancelled by user",
            "completedModules": 5,
            "totalModules": 28,
            "cancelled": True,
        }
    )

    class _FakeRedis:
        def __init__(self) -> None:
            self._calls = 0

        async def get(self, _key: str):
            self._calls += 1
            if self._calls >= 2:
                return cancel_raw
            return None

        async def expire(self, *_a, **_k):
            return True

        async def aclose(self) -> None:
            return None

    async def _fake_get_redis():
        return _FakeRedis()

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        return object()

    monkeypatch.setattr(scans_endpoint, "get_redis_async", _fake_get_redis)
    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    monkeypatch.setattr(asyncio, "sleep", AsyncMock(return_value=None))

    response = await async_client.get(f"/api/v1/scans/{scan_id}/progress")
    assert response.status_code == 200
    body = response.text
    assert "cancelled" in body
    assert '"done":true' in body.replace(" ", "")
