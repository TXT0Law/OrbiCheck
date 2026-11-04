from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from kombu.exceptions import OperationalError

from app.api.v1.endpoints import report_schedules as report_schedule_endpoints
from app.services import report_schedule_service
from app.tasks import report_schedule_tasks


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


@pytest.mark.asyncio
@pytest.mark.integration
async def test_run_now_returns_durable_run_id_during_broker_outage(async_client, monkeypatch) -> None:
    run = SimpleNamespace(id=uuid4())

    async def create_pending_run(*_args):
        return run

    monkeypatch.setattr(report_schedule_endpoints.settings, "APP_ENV", "test")
    monkeypatch.setattr(report_schedule_service, "create_schedule_run", create_pending_run)
    publish = MagicMock(side_effect=OperationalError("broker unavailable"))
    monkeypatch.setattr(report_schedule_tasks.generate_scheduled_report_run, "apply_async", publish)
    recovery_db = MagicMock()
    recovery_db.__enter__.return_value = recovery_db
    monkeypatch.setattr(report_schedule_tasks, "_get_sync_session", lambda: recovery_db)

    response = await async_client.post(f"/api/v1/report-schedules/{uuid4()}/run-now")

    assert response.status_code == 200
    assert response.json()["data"]["runId"] == str(run.id)
    publish.assert_called_once_with(args=(str(run.id),), retry=False, ignore_result=True)
    recovery_db.commit.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_runs_and_recent_runs_share_safe_owner_projection(async_client, monkeypatch) -> None:
    from unittest.mock import AsyncMock

    from app.models.report_schedule import ReportSchedule, ReportScheduleRun, ReportScheduleRunStatus

    payload = _schedule_response()
    payload.pop('recent_runs')
    schedule = ReportSchedule(**payload)
    foreign_report_id = uuid4()
    run = ReportScheduleRun(
        id=uuid4(), schedule_id=schedule.id, report_id=foreign_report_id,
        status=ReportScheduleRunStatus.FAILED,
        error_message='https://secret.invalid/webhook',
        delivery_summary={'outcome': 'unconfirmed', 'secret': 'hidden',
                          'channels': {'email': [{'success': 'true'}]}},
    )
    schedule.runs = [run]
    calls = []

    async def execute(statement):
        calls.append(statement)
        result = MagicMock()
        sql = str(statement)
        if 'FROM report_schedules' in sql:
            result.scalar_one_or_none.return_value = schedule
            result.scalars.return_value = [schedule]
        elif 'FROM report_schedule_runs' in sql:
            result.scalars.return_value = [run]
        else:
            result.all.return_value = []  # owner-filtered join finds no accessible report
        return result

    db = SimpleNamespace(execute=AsyncMock(side_effect=execute))
    monkeypatch.setattr(report_schedule_endpoints, 'get_db', lambda: db)

    # The fixture owns its app, so override the service session at its public entry points.
    original_runs = report_schedule_service.list_schedule_runs
    original_list = report_schedule_service.list_schedules
    original_detail = report_schedule_service.get_schedule_response

    async def runs(_db, schedule_id, user_id):
        return await original_runs(db, schedule_id, user_id)

    async def schedules(_db, user_id):
        return await original_list(db, user_id)

    async def detail(_db, schedule_id, user_id):
        return await original_detail(db, schedule_id, user_id)

    monkeypatch.setattr(report_schedule_service, 'get_schedule_response', detail)
    monkeypatch.setattr(report_schedule_service, 'list_schedule_runs', runs)
    monkeypatch.setattr(report_schedule_service, 'list_schedules', schedules)
    history = await async_client.get(f'/api/v1/report-schedules/{schedule.id}/runs')
    listing = await async_client.get('/api/v1/report-schedules')
    assert history.status_code == listing.status_code == 200
    detail_response = await async_client.get(f'/api/v1/report-schedules/{schedule.id}')
    assert detail_response.status_code == 200
    projected = history.json()['data']['runs'][0]
    assert detail_response.json()['data']['recentRuns'][0] == projected
    assert listing.json()['data']['schedules'][0]['recentRuns'][0] == projected
    assert projected['reportId'] is None
    assert projected['operations']['artifactState'] == 'missing'
    assert projected['operations']['deliveryState'] == 'unconfirmed'
    assert 'secret.invalid' not in history.text
    assert str(foreign_report_id) not in history.text
    report_queries = [query for query in calls if 'FROM reports' in str(query)]
    assert len(report_queries) == 3
    assert all('reports.user_id' in str(query) for query in report_queries)
    assert all('content_pdf' not in str(query) for query in report_queries)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_exact_run_endpoint_returns_pending_without_history(async_client, monkeypatch) -> None:
    from unittest.mock import AsyncMock

    from app.core.deps import get_db
    from app.models.report_schedule import ReportScheduleRun, ReportScheduleRunStatus

    schedule_id, run_id = uuid4(), uuid4()
    run = ReportScheduleRun(id=run_id, schedule_id=schedule_id,
                            status=ReportScheduleRunStatus.PENDING)
    result = MagicMock()
    result.scalar_one_or_none.return_value = run
    db = SimpleNamespace(execute=AsyncMock(return_value=result))

    async def override_db():
        yield db

    async_client._transport.app.dependency_overrides[get_db] = override_db
    response = await async_client.get(f'/api/v1/report-schedules/{schedule_id}/runs/{run_id}')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['id'] == str(run_id)
    assert data['operations']['deliveryState'] == 'not_started'
    assert data['operations']['reviewReason'] is None
    statement = db.execute.call_args.args[0]
    assert not statement._with_options
    assert len(db.execute.call_args_list) == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_exact_run_hides_inaccessible_associations(async_client) -> None:
    from unittest.mock import AsyncMock

    from app.core.deps import get_db

    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db = SimpleNamespace(execute=AsyncMock(return_value=result))

    async def override_db():
        yield db

    async_client._transport.app.dependency_overrides[get_db] = override_db
    response = await async_client.get(f'/api/v1/report-schedules/{uuid4()}/runs/{uuid4()}')
    assert response.status_code == 404
    assert response.json()['error'] == {
        'code': 'REPORT_SCHEDULE_RUN_NOT_FOUND', 'message': 'Report schedule run not found',
    }
