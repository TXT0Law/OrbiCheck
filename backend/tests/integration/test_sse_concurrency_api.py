from __future__ import annotations

import asyncio
import json
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import scans as scans_endpoint
from app.core.exceptions import ScanNotFoundError
from app.services import scan_service


@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_clients_receive_terminal_sse_events(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    raw = json.dumps(
        {
            "progress": 100,
            "phase": "completed",
            "detail": "done",
            "completedModules": 3,
            "totalModules": 3,
        }
    )

    class _FakeRedis:
        def __init__(self) -> None:
            self.calls = 0

        async def get(self, _key: str):
            self.calls += 1
            if self.calls >= 2:
                return raw
            return None

        async def expire(self, *_args, **_kwargs):
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

    responses = await asyncio.gather(
        async_client.get(f"/api/v1/scans/{scan_id}/progress"),
        async_client.get(f"/api/v1/scans/{scan_id}/progress"),
    )

    for response in responses:
        assert response.status_code == 200
        compact = response.text.replace(" ", "")
        assert '"phase":"completed"' in compact
        assert '"done":true' in compact


@pytest.mark.integration
@pytest.mark.asyncio
async def test_sse_invalid_scan_returns_404(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()

    async def _fake_get_scan(_db, _scan_id, _user_id=None):
        raise ScanNotFoundError(str(scan_id))

    monkeypatch.setattr(scan_service, "get_scan", _fake_get_scan)
    response = await async_client.get(f"/api/v1/scans/{scan_id}/progress")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCAN_NOT_FOUND"
