from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1.endpoints import report_schedules as report_schedule_endpoints
from app.services import report_schedule_service


def _schedule_response(**overrides):
    now = datetime.now(timezone.utc)
    base = {
        "id": uuid4(),
        "user_id": 1,
        "name": "Weekly security report",
        "scan_id": uuid4(),
        "monitor_id": None,
        "monitor_period": "30d",
        "format": "pdf",
        "cadence": "weekly",
        "timezone": "UTC",
        "day_of_week": 0,
        "day_of_month": None,
        "hour": 9,
        "minute": 0,
        "delivery_channels": ["email"],
        "email_recipients": ["security@example.com"],
        "is_enabled": True,
        "last_run_at": None,
        "next_run_at": now,
        "created_at": now,
        "updated_at": now,
        "recent_runs": [],
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_report_schedule_endpoint(async_client, monkeypatch) -> None:
    payload = _schedule_response()

    async def fake_create(*_args, **_kwargs):
        return SimpleNamespace(id=payload["id"])

    async def fake_get_response(*_args, **_kwargs):
        return payload

    monkeypatch.setattr(report_schedule_service, "create_schedule", fake_create)
    monkeypatch.setattr(report_schedule_service, "get_schedule_response", fake_get_response)

    response = await async_client.post(
        "/api/v1/report-schedules",
        json={
            "name": "Weekly security report",
            "scanId": str(uuid4()),
            "format": "pdf",
            "cadence": "weekly",
            "timezone": "UTC",
            "dayOfWeek": 0,
            "hour": 9,
            "minute": 0,
            "deliveryChannels": ["email"],
            "emailRecipients": ["security@example.com"],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["data"]["name"] == "Weekly security report"
    assert body["data"]["deliveryChannels"] == ["email"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_run_report_schedule_now_endpoint(async_client, monkeypatch) -> None:
    run_id = uuid4()

    async def fake_create_run(*_args, **_kwargs):
        return SimpleNamespace(id=run_id)

    monkeypatch.setattr(report_schedule_service, "create_schedule_run", fake_create_run)
    monkeypatch.setattr(
        report_schedule_endpoints.generate_scheduled_report_run,
        "run",
        lambda *_args, **_kwargs: None,
    )

    response = await async_client.post(f"/api/v1/report-schedules/{uuid4()}/run-now")

    assert response.status_code == 200
    assert response.json()["data"]["runId"] == str(run_id)
