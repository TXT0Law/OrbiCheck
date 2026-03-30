"""Integration-style tests for monitor changes list filters."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorChangeResponse
from app.services import monitor_service


@pytest.mark.asyncio
async def test_get_changes_passes_filters_to_service(async_client, monkeypatch) -> None:
    mid = uuid4()
    captured: dict = {}

    async def _get_changes(
        monitor_id,
        user_id,
        page,
        limit,
        db,
        period=None,
        category=None,
        sort="desc",
    ):
        captured["period"] = period
        captured["category"] = category
        captured["sort"] = sort
        row = MonitorChangeResponse(
            id=str(uuid4()),
            monitor_id=str(monitor_id),
            detected_at=datetime.now(timezone.utc),
            previous_snapshot_id=str(uuid4()),
            current_snapshot_id=str(uuid4()),
            diff_summary={
                "linesAdded": 1,
                "linesRemoved": 0,
                "linesChanged": 0,
                "totalDiffLines": 1,
                "changeCategory": "small",
            },
        )
        return [row], {"page": 1, "limit": 20, "total": 1}

    monkeypatch.setattr(monitor_service, "get_changes", _get_changes)
    r = await async_client.get(
        f"/api/v1/monitors/{mid}/changes?period=7d&category=small&sort=asc"
    )
    assert r.status_code == 200
    assert captured["period"] == "7d"
    assert captured["category"] == "small"
    assert captured["sort"] == "asc"
