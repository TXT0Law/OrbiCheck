"""Integration tests for alert event endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.v1.schemas.alert import AlertEventResponse
from app.services import alert_service


def _alert_event_response() -> AlertEventResponse:
    now = datetime.now(timezone.utc)
    return AlertEventResponse(
        id=str(uuid4()),
        monitor_id=str(uuid4()),
        capability="uptime_only",
        event_type="downtime",
        severity="critical",
        threshold_config={"consecutiveFailures": 3},
        actual_value="consecutiveFailures:3",
        message="Monitor is down",
        dispatched_channels=["sse"],
        suppressed=False,
        suppress_reason=None,
        created_at=now,
        resolved_at=None,
        acknowledged_at=None,
        acknowledged_by=None,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_alerts(async_client, monkeypatch) -> None:
    alert = _alert_event_response()

    async def fake_list(**_kwargs):
        return [alert], {"page": 1, "limit": 20, "total": 1}

    monkeypatch.setattr(alert_service, "list_alert_events_for_user", fake_list)
    response = await async_client.get("/api/v1/alerts")

    assert response.status_code == 200
    body = response.json()
    assert body["data"][0]["eventType"] == "downtime"
    assert body["meta"]["total"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_acknowledge_alert(async_client, monkeypatch) -> None:
    alert = _alert_event_response()
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert_id = uuid4()

    async def fake_acknowledge(**_kwargs):
        return alert

    monkeypatch.setattr(alert_service, "acknowledge_alert_event", fake_acknowledge)
    response = await async_client.patch(f"/api/v1/alerts/{alert_id}/acknowledge")

    assert response.status_code == 200
    assert response.json()["data"]["acknowledgedAt"] is not None
