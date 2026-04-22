"""Phase 2b — integration tests for the new DNS / CT / Maintenance endpoints.

The dependency-override pattern from `tests/conftest.py` already wires a
`_FakeDbSession`; here we monkeypatch the service-layer functions so the API
handlers exercise serialization, query parsing, and response envelopes without
needing a live Postgres instance. The mutating maintenance-window endpoints
also override `get_db` so the route can call ``db.commit()`` without raising.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.deps import get_db
from app.services import (
    ct_log_service,
    dns_monitor_service,
    maintenance_window_service,
    monitor_service,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fake_monitor(monitor_id: UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=monitor_id,
        user_id=1,
        display_name="DNS Monitor",
        url="https://example.com",
        tags=["prod"],
    )


# ── DNS records / changes ──────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_dns_records_returns_payload(async_client, monkeypatch) -> None:
    monitor_id = uuid4()
    record = SimpleNamespace(
        id=uuid4(),
        monitor_id=monitor_id,
        record_type="A",
        values=["1.2.3.4", "5.6.7.8"],
        observed_at=_now(),
        last_change_at=None,
    )

    async def _get_monitor(_mid, _uid, _db):
        return _fake_monitor(monitor_id)

    async def _list_records(_mid, _db):
        return [record]

    monkeypatch.setattr(monitor_service, "get_monitor", _get_monitor)
    monkeypatch.setattr(dns_monitor_service, "list_dns_records", _list_records)

    response = await async_client.get(
        f"/api/v1/monitors/{monitor_id}/dns/records"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert len(body["data"]) == 1
    assert body["data"][0]["recordType"] == "A"
    assert body["data"][0]["values"] == ["1.2.3.4", "5.6.7.8"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_dns_changes_paginates(async_client, monkeypatch) -> None:
    monitor_id = uuid4()
    change = SimpleNamespace(
        id=uuid4(),
        monitor_id=monitor_id,
        record_type="A",
        detected_at=_now(),
        previous_values=["1.2.3.4"],
        current_values=["1.2.3.5"],
        added_values=["1.2.3.5"],
        removed_values=["1.2.3.4"],
    )

    captured: dict[str, object] = {}

    async def _get_monitor(_mid, _uid, _db):
        return _fake_monitor(monitor_id)

    async def _list_changes(_mid, _db, *, limit, offset):
        captured["limit"] = limit
        captured["offset"] = offset
        return [change]

    monkeypatch.setattr(monitor_service, "get_monitor", _get_monitor)
    monkeypatch.setattr(dns_monitor_service, "list_dns_changes", _list_changes)

    response = await async_client.get(
        f"/api/v1/monitors/{monitor_id}/dns/changes?page=2&limit=25"
    )
    assert response.status_code == 200
    assert captured == {"limit": 25, "offset": 25}
    body = response.json()
    assert body["data"][0]["addedValues"] == ["1.2.3.5"]
    assert body["data"][0]["removedValues"] == ["1.2.3.4"]


# ── CT entries ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_ct_entries_returns_payload(async_client, monkeypatch) -> None:
    monitor_id = uuid4()
    entry = SimpleNamespace(
        id=uuid4(),
        monitor_id=monitor_id,
        hostname="example.com",
        serial_number="0a1b2c3d",
        leaf_sha256="deadbeef" * 8,
        issuer_name="Let's Encrypt",
        common_name="example.com",
        not_before=_now() - timedelta(days=10),
        not_after=_now() + timedelta(days=80),
        observed_at=_now(),
        crtsh_id="9999",
        pin_violation=True,
        alerted_at=None,
    )

    async def _get_monitor(_mid, _uid, _db):
        return _fake_monitor(monitor_id)

    async def _list_entries(_mid, _db, *, limit, offset):
        assert limit == 50
        assert offset == 0
        return [entry]

    monkeypatch.setattr(monitor_service, "get_monitor", _get_monitor)
    monkeypatch.setattr(ct_log_service, "list_ct_entries", _list_entries)

    response = await async_client.get(
        f"/api/v1/monitors/{monitor_id}/ct/entries"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"][0]["serialNumber"] == "0a1b2c3d"
    assert body["data"][0]["pinViolation"] is True


# ── Active maintenance windows ──────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.integration
async def test_active_maintenance_windows_endpoint(
    async_client, monkeypatch
) -> None:
    monitor_id = uuid4()
    window_id = uuid4()
    starts = _now() - timedelta(minutes=10)
    ends = _now() + timedelta(minutes=50)

    summary = SimpleNamespace(
        id=window_id,
        title="DB upgrade",
        starts_at=starts,
        ends_at=ends,
        suppress_alerts=True,
        suppress_probes=False,
    )
    row = SimpleNamespace(
        id=window_id,
        user_id=1,
        monitor_id=None,
        title="DB upgrade",
        starts_at=starts,
        ends_at=ends,
        suppress_alerts=True,
        suppress_probes=False,
        is_enabled=True,
        notes="Quarterly",
        recurrence={"freq": "weekly", "byWeekday": [0]},
        tag_scope=["prod"],
        created_at=_now(),
        updated_at=_now(),
    )

    async def _get_monitor(_mid, _uid, _db):
        return _fake_monitor(monitor_id)

    async def _list_active(_uid, _mid, _db, *, monitor_tags=None):
        return [summary]

    async def _list_windows(_uid, _db, *, monitor_id=None, include_disabled):
        return [row]

    monkeypatch.setattr(monitor_service, "get_monitor", _get_monitor)
    monkeypatch.setattr(
        maintenance_window_service, "list_active_windows", _list_active
    )
    monkeypatch.setattr(
        maintenance_window_service,
        "list_windows_for_user",
        _list_windows,
    )

    response = await async_client.get(
        f"/api/v1/monitors/{monitor_id}/maintenance/active"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["title"] == "DB upgrade"
    assert body["data"][0]["recurrence"]["freq"] == "weekly"
    assert body["data"][0]["tagScope"] == ["prod"]


# ── Maintenance window CRUD ─────────────────────────────────────────────


class _CountingDb:
    """Minimal session double tracking commit/flush calls for assertions."""

    def __init__(self) -> None:
        self.commits = 0
        self.flushes = 0
        self.added: list[object] = []
        self.deleted: list[object] = []

    async def execute(self, *_a, **_kw):
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=list)
        )

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        return None

    async def flush(self) -> None:
        self.flushes += 1

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def delete(self, obj: object) -> None:
        self.deleted.append(obj)

    async def get(self, *_a, **_kw):
        return None

    async def refresh(self, _obj) -> None:
        return None


def _maint_row(window_id: UUID, *, recurrence=None, tag_scope=None):
    starts = _now()
    ends = _now() + timedelta(hours=1)
    return SimpleNamespace(
        id=window_id,
        user_id=1,
        monitor_id=None,
        title="Routine",
        starts_at=starts,
        ends_at=ends,
        suppress_alerts=True,
        suppress_probes=False,
        is_enabled=True,
        notes=None,
        recurrence=recurrence,
        tag_scope=tag_scope,
        created_at=starts,
        updated_at=starts,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_maintenance_window_with_recurrence(
    test_app, monkeypatch
) -> None:
    db = _CountingDb()

    async def _get_db():
        yield db

    test_app.dependency_overrides[get_db] = _get_db

    captured: dict[str, object] = {}

    async def _create_window(**kwargs):
        captured.update(kwargs)
        return _maint_row(
            uuid4(),
            recurrence=kwargs.get("recurrence")
            and kwargs["recurrence"].model_dump(by_alias=True, exclude_none=True),
            tag_scope=kwargs.get("tag_scope"),
        )

    monkeypatch.setattr(
        maintenance_window_service, "create_window", _create_window
    )

    starts = _now()
    ends = starts + timedelta(hours=2)
    payload = {
        "title": "Weekly cleanup",
        "startsAt": starts.isoformat(),
        "endsAt": ends.isoformat(),
        "suppressAlerts": True,
        "suppressProbes": False,
        "recurrence": {
            "freq": "weekly",
            "byWeekday": [0, 4],
        },
        "tagScope": ["prod", "edge"],
    }

    transport = ASGITransport(app=test_app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/v1/maintenance-windows", json=payload
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["data"]["recurrence"]["freq"] == "weekly"
    assert sorted(body["data"]["recurrence"]["byWeekday"]) == [0, 4]
    assert sorted(body["data"]["tagScope"]) == ["edge", "prod"]
    assert captured["tag_scope"] == ["edge", "prod"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_maintenance_window_clears_recurrence(
    test_app, monkeypatch
) -> None:
    db = _CountingDb()

    async def _get_db():
        yield db

    test_app.dependency_overrides[get_db] = _get_db

    window_id = uuid4()
    captured: dict[str, object] = {}

    async def _update(**kwargs):
        captured.update(kwargs)
        return _maint_row(window_id, recurrence=None, tag_scope=None)

    monkeypatch.setattr(maintenance_window_service, "update_window", _update)

    payload = {
        "title": "Updated",
        "clearRecurrence": True,
        "clearTagScope": True,
    }

    transport = ASGITransport(app=test_app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.patch(
            f"/api/v1/maintenance-windows/{window_id}", json=payload
        )

    assert response.status_code == 200, response.text
    assert captured.get("recurrence") is None
    assert captured.get("tag_scope") is None
    assert "recurrence" in captured
    assert "tag_scope" in captured


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_maintenance_window_invalid_range_returns_422(
    test_app, monkeypatch
) -> None:
    async def _get_db():
        yield _CountingDb()

    test_app.dependency_overrides[get_db] = _get_db

    async def _raise(**_kw):
        raise ValueError("ends_at must be after starts_at")

    monkeypatch.setattr(maintenance_window_service, "update_window", _raise)

    starts = _now()
    payload = {
        "title": "Updated",
        "startsAt": starts.isoformat(),
        "endsAt": (starts - timedelta(hours=1)).isoformat(),
    }

    transport = ASGITransport(app=test_app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.patch(
            f"/api/v1/maintenance-windows/{uuid4()}", json=payload
        )

    assert response.status_code == 422
    body = response.json()
    assert "MAINT_WINDOW_INVALID_RANGE" in str(body)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_maintenance_window_404_when_missing(
    test_app, monkeypatch
) -> None:
    async def _get_db():
        yield _CountingDb()

    test_app.dependency_overrides[get_db] = _get_db

    async def _delete(**_kw):
        return False

    monkeypatch.setattr(maintenance_window_service, "delete_window", _delete)

    transport = ASGITransport(app=test_app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.delete(
            f"/api/v1/maintenance-windows/{uuid4()}"
        )

    assert response.status_code == 404
