"""Integration-style tests for monitor series and uptime endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import (
    MonitorFailureDistribution,
    MonitorTimeSeriesBucket,
    MonitorTimeSeriesData,
    MonitorUptimeSummaryResponse,
)
from app.services import monitor_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_series_returns_buckets(async_client, monkeypatch) -> None:
    mid = uuid4()
    now = datetime.now(timezone.utc)
    data = MonitorTimeSeriesData(
        period="24h",
        resolution="5m",
        points=[
            MonitorTimeSeriesBucket(
                timestamp=now,
                success_rate=100.0,
                avg_response_time=120.0,
                min_response_time=100.0,
                max_response_time=140.0,
                check_count=3,
            )
        ],
    )

    async def _series(i, uid, p, db):
        assert p == "24h"
        return data

    monkeypatch.setattr(monitor_service, "get_time_series", _series)
    r = await async_client.get(f"/api/v1/monitors/{mid}/series?period=24h")
    assert r.status_code == 200
    payload = r.json()["data"]
    assert payload["period"] == "24h"
    assert payload["resolution"] == "5m"
    assert len(payload["points"]) == 1
    assert payload["points"][0]["checkCount"] == 3


@pytest.mark.asyncio
@pytest.mark.integration
async def test_uptime_summary_shape(async_client, monkeypatch) -> None:
    mid = uuid4()
    from app.api.v1.schemas.monitor import MonitorCurrentStreak

    summary = MonitorUptimeSummaryResponse(
        period="7d",
        total_checks=100,
        successful_checks=99,
        failed_checks=1,
        uptime_percentage=99.0,
        avg_response_time_ms=200.0,
        p95_response_time_ms=400.0,
        incidents=1,
        current_streak=MonitorCurrentStreak(
            status="up",
            since=datetime.now(timezone.utc),
            duration_seconds=3600,
        ),
        failure_distribution=MonitorFailureDistribution(
            TIMEOUT=0,
            DNS=0,
            CONNECTION=1,
            SSL=0,
            HTTP_ERROR=0,
            UNKNOWN=0,
        ),
    )

    async def _up(i, uid, p, db):
        return summary

    monkeypatch.setattr(monitor_service, "get_uptime_summary", _up)
    r = await async_client.get(f"/api/v1/monitors/{mid}/uptime?period=7d")
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["failedChecks"] == 1
    assert d["failureDistribution"]["CONNECTION"] == 1
