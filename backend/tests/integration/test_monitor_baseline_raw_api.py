"""Integration-style tests for baseline and raw snapshot routes."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorBaselineResponse
from app.models.monitor import MonitorSnapshot
from app.services import monitor_service


@pytest.mark.asyncio
async def test_content_baseline_route(async_client, monkeypatch) -> None:
    mid = uuid4()

    async def _baseline(monitor_id, user_id, db):
        return MonitorBaselineResponse(
            snapshot_id=str(uuid4()),
            captured_at=datetime.now(timezone.utc),
            content_hash="ab" * 32,
            content_size_bytes=10,
            content_type="text/html",
            charset="utf-8",
            http_status_code=200,
            is_baseline=True,
        )

    monkeypatch.setattr(monitor_service, "get_baseline_snapshot", _baseline)
    r = await async_client.get(f"/api/v1/monitors/{mid}/content/baseline")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["data"]["contentHash"] == "ab" * 32


@pytest.mark.asyncio
async def test_snapshot_raw_route(async_client, monkeypatch) -> None:
    mid = uuid4()
    sid = uuid4()

    async def _raw(monitor_id, snapshot_id, user_id, db):
        m = MonitorSnapshot(
            id=snapshot_id,
            monitor_id=monitor_id,
            check_id=uuid4(),
            content_hash="x" * 64,
            content_size_bytes=5,
            content="<p>hi</p>",
            content_type="text/html; charset=utf-8",
        )
        return m

    monkeypatch.setattr(monitor_service, "get_snapshot_raw_for_owner", _raw)
    r = await async_client.get(f"/api/v1/monitors/{mid}/snapshots/{sid}/raw")
    assert r.status_code == 200
    assert "<p>hi</p>" in r.text
    assert "text/html" in (r.headers.get("content-type") or "")
    assert r.headers.get("content-length") == str(len("<p>hi</p>".encode("utf-8")))
