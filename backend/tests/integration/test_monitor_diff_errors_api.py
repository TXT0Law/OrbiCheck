"""Integration-style tests for diff endpoint error codes."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.exceptions import ChangeNotFoundException, SnapshotNotFoundException
from app.services import monitor_service


@pytest.mark.asyncio
async def test_diff_returns_change_not_found_code(async_client, monkeypatch) -> None:
    async def _boom(*_a, **_kw):
        raise ChangeNotFoundException(message="missing")

    monkeypatch.setattr(monitor_service, "get_change_diff", _boom)
    r = await async_client.get(
        f"/api/v1/monitors/{uuid4()}/changes/{uuid4()}/diff"
    )
    assert r.status_code == 404
    body = r.json()
    assert body["status"] == "error"
    assert body["error"]["code"] == "CHANGE_NOT_FOUND"


@pytest.mark.asyncio
async def test_diff_returns_snapshot_not_found_code(async_client, monkeypatch) -> None:
    async def _boom(*_a, **_kw):
        raise SnapshotNotFoundException()

    monkeypatch.setattr(monitor_service, "get_change_diff", _boom)
    r = await async_client.get(
        f"/api/v1/monitors/{uuid4()}/changes/{uuid4()}/diff"
    )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "SNAPSHOT_NOT_FOUND"
