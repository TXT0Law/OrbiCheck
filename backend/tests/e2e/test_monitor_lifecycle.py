from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorChangeResponse, MonitorResponse
from app.core.exceptions import NotFoundError
from app.services import monitor_service


def _monitor_payload(monitor_id: UUID, url: str, *, status: str = "up") -> MonitorResponse:
    now = datetime.now(timezone.utc)
    return MonitorResponse(
        id=str(monitor_id),
        display_name="Demo monitor",
        url=url,
        enabled_capabilities=["uptime_only", "content_change"],
        capabilities={},
        capability_statuses=[],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=status,
        last_check_at=now,
        last_status_code=200,
        last_response_time_ms=120.0,
        last_change_detected_at=None,
        ssl_expiry_days=None,
        total_checks=1,
        consecutive_failures=0,
        uptime_percentage=100.0,
        avg_response_time_ms=120.0,
        last_success=True,
        tags=[],
        created_at=now,
        updated_at=now,
    )


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_monitor_create_read_changes_delete_flow(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monitors: dict[UUID, MonitorResponse] = {}
    changes: dict[UUID, list[MonitorChangeResponse]] = {}

    async def _fake_create_monitor(user_id: int, request, db):
        monitor_id = uuid4()
        monitor = _monitor_payload(monitor_id, str(request.url))
        monitors[monitor_id] = monitor
        changes[monitor_id] = []
        return monitor

    async def _fake_get_monitor(monitor_id: UUID, user_id: int, db):
        if monitor_id not in monitors:
            raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
        return monitors[monitor_id]

    async def _fake_get_changes(monitor_id: UUID, user_id: int, page: int, limit: int, db, **kwargs):
        return changes.get(monitor_id, []), {"page": page, "limit": limit, "total": len(changes.get(monitor_id, []))}

    async def _fake_delete_monitor(monitor_id: UUID, user_id: int, db):
        if monitor_id not in monitors:
            raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
        del monitors[monitor_id]

    monkeypatch.setattr(monitor_service, "create_monitor", _fake_create_monitor)
    monkeypatch.setattr(monitor_service, "get_monitor", _fake_get_monitor)
    monkeypatch.setattr(monitor_service, "get_changes", _fake_get_changes)
    monkeypatch.setattr(monitor_service, "delete_monitor", _fake_delete_monitor)

    create_response = await async_client.post(
        "/api/v1/monitors",
        json={
            "displayName": "Demo monitor",
            "url": "https://example.com",
            "enabledCapabilities": ["uptime_only", "content_change"],
        },
    )
    monitor_id = UUID(create_response.json()["data"]["id"])
    changes[monitor_id] = [
        MonitorChangeResponse(
            id=str(uuid4()),
            monitor_id=str(monitor_id),
            detected_at=datetime.now(timezone.utc),
            diff_summary={"changeCategory": "small"},
            change_size_bytes=12,
            previous_snapshot_id=None,
            current_snapshot_id=None,
        )
    ]

    detail_response = await async_client.get(f"/api/v1/monitors/{monitor_id}")
    changes_response = await async_client.get(f"/api/v1/monitors/{monitor_id}/changes")
    delete_response = await async_client.delete(f"/api/v1/monitors/{monitor_id}")
    missing_response = await async_client.get(f"/api/v1/monitors/{monitor_id}")

    assert create_response.status_code == 201
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["status"] == "up"
    assert changes_response.status_code == 200
    assert changes_response.json()["data"][0]["diffSummary"]["changeCategory"] == "small"
    assert delete_response.status_code == 200
    assert missing_response.status_code == 404
