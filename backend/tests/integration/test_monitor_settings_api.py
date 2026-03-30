"""Integration tests for strongly typed monitor settings updates."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import AsyncGenerator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.deps import get_db
from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorStatus


class _MonitorDbSession:
    def __init__(self, monitor: Monitor) -> None:
        self.monitor = monitor

    async def get(self, model, pk):
        if model is Monitor and pk == self.monitor.id:
            return self.monitor
        return None

    async def flush(self) -> None:
        if self.monitor.updated_at is None:
            self.monitor.updated_at = datetime.now(timezone.utc)

    async def refresh(self, _obj) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


def _monitor() -> Monitor:
    now = datetime.now(timezone.utc)
    caps = capabilities_from_enabled_list(["uptime_only", "ssl_expiry"])
    return Monitor(
        id=uuid4(),
        user_id=1,
        display_name="Settings Monitor",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["uptime_only", "ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
        total_checks=0,
        consecutive_failures=0,
        created_at=now,
        updated_at=now,
    )


async def _client_with_monitor(
    test_app,
    monitor: Monitor,
) -> AsyncGenerator[AsyncClient, None]:
    async def override_db():
        yield _MonitorDbSession(monitor)

    test_app.dependency_overrides[get_db] = override_db
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.mark.asyncio
@pytest.mark.integration
async def test_partial_capability_update_merges_and_validates(test_app) -> None:
    monitor = _monitor()
    async for client in _client_with_monitor(test_app, monitor):
        response = await client.put(
            f"/api/v1/monitors/{monitor.id}",
            json={
                "capabilities": {
                    "uptime_only": {
                        "thresholds": {
                            "maxResponseTimeMs": 9000,
                        }
                    }
                }
            },
        )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["capabilities"]["uptime_only"]["thresholds"]["maxResponseTimeMs"] == 9000
    assert body["capabilities"]["uptime_only"]["thresholds"]["consecutiveFailures"] == 3


@pytest.mark.asyncio
@pytest.mark.integration
async def test_invalid_ssl_thresholds_return_422(test_app) -> None:
    monitor = _monitor()
    async for client in _client_with_monitor(test_app, monitor):
        response = await client.put(
            f"/api/v1/monitors/{monitor.id}",
            json={
                "capabilities": {
                    "ssl_expiry": {
                        "thresholds": {
                            "warnDaysRemaining": 7,
                            "criticalDaysRemaining": 7,
                        }
                    }
                }
            },
        )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_interval_below_five_seconds_returns_422(test_app) -> None:
    monitor = _monitor()
    async for client in _client_with_monitor(test_app, monitor):
        response = await client.put(
            f"/api/v1/monitors/{monitor.id}",
            json={"intervalSeconds": 2},
        )

    assert response.status_code == 422
