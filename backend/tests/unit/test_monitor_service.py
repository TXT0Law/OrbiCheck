"""Unit tests for monitor status logic and SSE stream scaffolding."""

from __future__ import annotations

import asyncio
import uuid

import pytest

from app.models.monitor import Monitor, MonitorStatus
from app.services import monitor_service


@pytest.mark.unit
def test_determine_status_up_when_healthy() -> None:
    assert (
        monitor_service._determine_status(
            success=True,
            is_degraded=False,
            consecutive_failures=0,
            threshold_consecutive=3,
        )
        == MonitorStatus.UP
    )


@pytest.mark.unit
def test_determine_status_degraded_when_slow() -> None:
    assert (
        monitor_service._determine_status(
            success=True,
            is_degraded=True,
            consecutive_failures=0,
            threshold_consecutive=3,
        )
        == MonitorStatus.DEGRADED
    )


@pytest.mark.unit
def test_determine_status_degraded_below_failure_threshold() -> None:
    assert (
        monitor_service._determine_status(
            success=False,
            is_degraded=False,
            consecutive_failures=1,
            threshold_consecutive=3,
        )
        == MonitorStatus.DEGRADED
    )


@pytest.mark.unit
def test_determine_status_down_after_failures() -> None:
    assert (
        monitor_service._determine_status(
            success=False,
            is_degraded=False,
            consecutive_failures=3,
            threshold_consecutive=3,
        )
        == MonitorStatus.DOWN
    )


@pytest.mark.unit
def test_parse_uptime_thresholds_defaults() -> None:
    m = Monitor(
        display_name="x",
        url="https://example.com",
        capabilities={},
        enabled_capabilities=["uptime_only"],
        interval_seconds=60,
        tags=[],
    )
    th = monitor_service._parse_uptime_thresholds(m)
    assert th.consecutive_failures == 3
    assert th.max_response_time_ms is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_stream_channel_emits_heartbeat(monkeypatch) -> None:
    monkeypatch.setattr(
        monitor_service.settings,
        "MONITOR_SSE_HEARTBEAT_SECONDS",
        0.05,
    )

    class _PS:
        async def subscribe(self, *_a, **_kw) -> None:
            return None

        async def get_message(self, **_kw):
            await asyncio.sleep(0)
            return None

        async def unsubscribe(self, *_a, **_kw) -> None:
            return None

        async def close(self) -> None:
            return None

        async def aclose(self) -> None:
            return None

    class _R:
        def pubsub(self):
            return _PS()

        async def aclose(self) -> None:
            return None

    redis = _R()
    gen = monitor_service.stream_monitor_channel(uuid.uuid4(), redis)
    first = await asyncio.wait_for(gen.__anext__(), timeout=2.0)
    assert b"heartbeat" in first
    await gen.aclose()
