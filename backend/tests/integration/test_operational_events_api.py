from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest


def _event(**overrides):
    now = datetime.now(timezone.utc)
    data = {
        "id": uuid4(),
        "user_id": 1,
        "event_type": "report.generated",
        "status": "succeeded",
        "target_url": "https://example.com",
        "scan_id": uuid4(),
        "monitor_id": None,
        "report_id": uuid4(),
        "group_id": None,
        "group_run_id": None,
        "group_run_member_id": None,
        "duration_ms": 120,
        "retry_count": 0,
        "error_code": None,
        "message": "Report generated",
        "trace_id": "trace-123",
        "details": {"format": "pdf"},
        "created_at": now,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_report_operational_events_endpoint(client, monkeypatch) -> None:
    report_id = uuid4()

    async def _list_events(*_args, **_kwargs):
        return [_event(report_id=report_id)]

    monkeypatch.setattr(
        "app.api.v1.endpoints.reports.operational_event_service.list_events_for_report",
        _list_events,
    )

    response = await client.get(f"/api/v1/reports/{report_id}/events")

    assert response.status_code == 200
    payload = response.json()
    event = payload["data"]["events"][0]
    assert event["eventType"] == "report.generated"
    assert event["status"] == "succeeded"
    assert event["reportId"] == str(report_id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_group_run_operational_events_endpoint(client, monkeypatch) -> None:
    group_id = uuid4()
    run_id = uuid4()

    async def _list_events(*_args, **_kwargs):
        return [
            _event(
                event_type="url_group_run.completed",
                status="partial",
                group_id=group_id,
                group_run_id=run_id,
            )
        ]

    monkeypatch.setattr(
        "app.api.v1.endpoints.url_groups."
        "operational_event_service.list_events_for_group_run",
        _list_events,
    )

    response = await client.get(
        f"/api/v1/url-groups/{group_id}/runs/{run_id}/events"
    )

    assert response.status_code == 200
    event = response.json()["data"]["events"][0]
    assert event["eventType"] == "url_group_run.completed"
    assert event["status"] == "partial"
    assert event["groupRunId"] == str(run_id)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_scan_operational_events_endpoint(client, monkeypatch) -> None:
    scan_id = uuid4()

    async def _list_events(*_args, **_kwargs):
        return [
            _event(
                event_type="scan_service.per_module_retry_completed",
                status="succeeded",
                scan_id=scan_id,
            )
        ]

    monkeypatch.setattr(
        "app.api.v1.endpoints.scans.operational_event_service.list_events_for_scan",
        _list_events,
    )

    response = await client.get(f"/api/v1/scans/{scan_id}/events")

    assert response.status_code == 200
    event = response.json()["data"]["events"][0]
    assert event["eventType"] == "scan_service.per_module_retry_completed"
    assert event["scanId"] == str(scan_id)
