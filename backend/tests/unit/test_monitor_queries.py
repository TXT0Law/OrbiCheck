"""Unit tests for monitor DB-backed query helpers (mocked session)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorCheck, MonitorStatus
from app.services import monitor_service


def _mon(mid: UUID | None = None) -> Monitor:
    mid = mid or uuid4()
    return Monitor(
        id=mid,
        user_id=1,
        display_name="t",
        url="https://example.com",
        capabilities=capabilities_from_enabled_list(["uptime_only"]),
        enabled_capabilities=["uptime_only"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_time_series_returns_buckets() -> None:
    mid = uuid4()
    m = _mon(mid)
    ts = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    row_dict = {
        "bucket_start": ts,
        "check_count": 4,
        "success_rate": 100.0,
        "avg_rt": 50.0,
        "min_rt": 40.0,
        "max_rt": 60.0,
        "p50_rt": 50.0,
        "p95_rt": 58.0,
        "p99_rt": 60.0,
    }

    class _Maps:
        def all(self):
            return [row_dict]

    class _Res:
        def mappings(self):
            return _Maps()

    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.execute = AsyncMock(return_value=_Res())

    data = await monitor_service.get_time_series(mid, 1, "24h", db)
    assert data.period == "24h"
    assert data.resolution == "5m"
    assert len(data.points) == 1
    assert data.points[0].check_count == 4


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_uptime_summary_full() -> None:
    mid = uuid4()
    m = _mon(mid)
    t0 = datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 1, 1, 10, 5, tzinfo=timezone.utc)
    checks = [
        MonitorCheck(
            monitor_id=mid,
            success=True,
            response_time_ms=100.0,
            content_changed=False,
            evaluated_capabilities=[],
            checked_at=t0,
        ),
        MonitorCheck(
            monitor_id=mid,
            success=False,
            response_time_ms=0.0,
            error_type=None,
            content_changed=False,
            evaluated_capabilities=[],
            checked_at=t1,
        ),
    ]

    class _Sc:
        def all(self):
            return checks

    class _Res:
        def scalars(self):
            return _Sc()

    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.execute = AsyncMock(return_value=_Res())

    summary = await monitor_service.get_uptime_summary(mid, 1, "24h", db)
    assert summary.total_checks == 2
    assert summary.successful_checks == 1
    assert summary.failed_checks == 1
    assert summary.incidents == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_checks_period_filter() -> None:
    mid = uuid4()
    m = _mon(mid)

    class _Sc:
        def all(self):
            return []

    class _Res:
        def scalars(self):
            return _Sc()

    db = AsyncMock()
    db.get = AsyncMock(return_value=m)
    db.scalar = AsyncMock(return_value=0)
    db.execute = AsyncMock(return_value=_Res())

    rows, meta = await monitor_service.get_checks(
        mid, 1, 1, 20, db, period="24h", success=False, sort="asc"
    )
    assert rows == []
    assert meta["total"] == 0
