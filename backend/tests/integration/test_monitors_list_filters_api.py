"""Integration tests for Phase 1.3/1.4 list filter query params.

These check that the HTTP boundary correctly parses and forwards the new
``tags``/``tag_match``/``sort``/``latency_max_ms``/``uptime_min_percent``
parameters into ``monitor_service.list_monitors``. The service is monkey-
patched so we don't hit the database; per-filter SQL behavior is covered by
``backend/tests/unit/test_monitor_list_filters.py``.
"""

from __future__ import annotations

import pytest

from app.services import monitor_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_forwards_repeated_tags_and_match(
    async_client, monkeypatch
) -> None:
    captured: dict[str, object] = {}

    async def _list(**kwargs):
        captured.update(kwargs)
        return [], {"page": 1, "limit": 20, "total": 0}

    monkeypatch.setattr(monitor_service, "list_monitors", _list)

    r = await async_client.get(
        "/api/v1/monitors?tags=prod&tags=api&tag_match=all"
    )
    assert r.status_code == 200, r.text
    assert captured["tags"] == ["prod", "api"]
    assert captured["tag_match"] == "all"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_defaults_tag_match_to_any(async_client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _list(**kwargs):
        captured.update(kwargs)
        return [], {"page": 1, "limit": 20, "total": 0}

    monkeypatch.setattr(monitor_service, "list_monitors", _list)
    r = await async_client.get("/api/v1/monitors?tags=alpha")
    assert r.status_code == 200
    assert captured["tag_match"] == "any"
    assert captured["tags"] == ["alpha"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_rejects_invalid_tag_match(async_client) -> None:
    r = await async_client.get("/api/v1/monitors?tag_match=both")
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_forwards_sort_and_thresholds(async_client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def _list(**kwargs):
        captured.update(kwargs)
        return [], {"page": 1, "limit": 20, "total": 0}

    monkeypatch.setattr(monitor_service, "list_monitors", _list)

    r = await async_client.get(
        "/api/v1/monitors?sort=lastResponseTimeMs:asc"
        "&latency_max_ms=500&uptime_min_percent=95"
    )
    assert r.status_code == 200, r.text
    assert captured["sort"] == "lastResponseTimeMs:asc"
    assert captured["latency_max_ms"] == 500.0
    assert captured["uptime_min_percent"] == 95.0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_rejects_negative_thresholds(async_client) -> None:
    r = await async_client.get("/api/v1/monitors?latency_max_ms=-1")
    assert r.status_code == 422
    r = await async_client.get("/api/v1/monitors?uptime_min_percent=101")
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_omits_tag_match_when_no_tags(async_client, monkeypatch) -> None:
    """Endpoint always sets tag_match (defaults to 'any'); service should ignore it
    when ``tags`` is None to keep the SQL minimal."""
    captured: dict[str, object] = {}

    async def _list(**kwargs):
        captured.update(kwargs)
        return [], {"page": 1, "limit": 20, "total": 0}

    monkeypatch.setattr(monitor_service, "list_monitors", _list)

    r = await async_client.get("/api/v1/monitors")
    assert r.status_code == 200
    assert captured["tags"] is None
    assert captured["tag_match"] == "any"
