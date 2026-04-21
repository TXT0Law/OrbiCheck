"""Integration tests for ``POST /api/v1/monitors/bulk`` (Phase 1.2).

The bulk endpoint is a thin wrapper around ``monitor_service.bulk_act_on_monitors``;
these tests focus on the HTTP contract:

* request validation (action enum, ids size cap, dedupe via the schema)
* response envelope shape (``succeeded`` / ``failed`` / ``requested``)
* per-row error reporting without 5xx-ing the whole batch

The service layer is monkey-patched so we don't exercise the database here —
``backend/tests/unit/test_monitor_bulk_service.py`` covers ownership / DB paths.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.services import monitor_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_pause_returns_envelope(async_client, monkeypatch) -> None:
    ids = [str(uuid4()), str(uuid4())]

    captured: dict[str, object] = {}

    async def _fake(uid, action, monitor_ids, db):
        captured["uid"] = uid
        captured["action"] = action
        captured["monitor_ids"] = list(monitor_ids)
        return list(monitor_ids), []

    monkeypatch.setattr(monitor_service, "bulk_act_on_monitors", _fake)

    r = await async_client.post(
        "/api/v1/monitors/bulk",
        json={"action": "pause", "monitorIds": ids},
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "success"
    data = body["data"]
    assert data["action"] == "pause"
    assert data["succeeded"] == ids
    assert data["failed"] == []
    assert data["requested"] == 2
    assert captured["action"] == "pause"
    assert captured["monitor_ids"] == ids


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_partial_failure_surfaces_failed_list(
    async_client, monkeypatch
) -> None:
    good = str(uuid4())
    missing = str(uuid4())

    async def _fake(uid, action, monitor_ids, db):
        return (
            [good],
            [
                {
                    "monitor_id": missing,
                    "error_code": "MONITOR_NOT_FOUND",
                    "message": "Monitor not found",
                }
            ],
        )

    monkeypatch.setattr(monitor_service, "bulk_act_on_monitors", _fake)

    r = await async_client.post(
        "/api/v1/monitors/bulk",
        json={"action": "delete", "monitorIds": [good, missing]},
    )

    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["succeeded"] == [good]
    assert body["failed"] == [
        {
            "monitorId": missing,
            "errorCode": "MONITOR_NOT_FOUND",
            "message": "Monitor not found",
        }
    ]
    assert body["requested"] == 2


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_rejects_unknown_action(async_client) -> None:
    r = await async_client.post(
        "/api/v1/monitors/bulk",
        json={"action": "destroy", "monitorIds": [str(uuid4())]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_rejects_empty_ids(async_client) -> None:
    r = await async_client.post(
        "/api/v1/monitors/bulk",
        json={"action": "pause", "monitorIds": []},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_dedupes_ids_before_dispatch(async_client, monkeypatch) -> None:
    # The schema validator collapses dupes; we assert the service receives the
    # canonicalised list and the response counts the canonicalised total too.
    rid = str(uuid4())

    received: dict[str, object] = {}

    async def _fake(uid, action, monitor_ids, db):
        received["monitor_ids"] = list(monitor_ids)
        return list(monitor_ids), []

    monkeypatch.setattr(monitor_service, "bulk_act_on_monitors", _fake)

    r = await async_client.post(
        "/api/v1/monitors/bulk",
        json={"action": "resume", "monitorIds": [rid, rid, "  " + rid]},
    )

    assert r.status_code == 200
    assert received["monitor_ids"] == [rid]
    assert r.json()["data"]["requested"] == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_oversize_payload_rejected(async_client) -> None:
    too_many = [str(uuid4()) for _ in range(101)]
    r = await async_client.post(
        "/api/v1/monitors/bulk",
        json={"action": "pause", "monitorIds": too_many},
    )
    assert r.status_code == 422
