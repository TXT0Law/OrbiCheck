"""execute_check SSL branch: probe, snapshot, SSE on severity change."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorStatus
from app.services import monitor_service
from app.services.monitor_service import execute_check
from app.services.ssl_probe import SslProbeResult


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_threshold_sse_when_severity_changes(monkeypatch) -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    mon = Monitor(
        id=mid,
        user_id=1,
        display_name="s",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
        ssl_expiry_days=100,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=mon)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        )
    )
    redis = AsyncMock()

    async def _probe(*_a, **_kw):
        return SslProbeResult(
            success=True,
            hostname="example.com",
            port=443,
            probe_time_ms=1.0,
            days_remaining=5,
            not_before="2025-01-01T00:00:00+00:00",
            not_after="2030-01-01T00:00:00+00:00",
            subject_dn="CN=x",
            issuer_dn="CN=y",
            serial_number="1",
            signature_algorithm="sha256",
            sha256_fingerprint="AA",
            is_valid=True,
            is_expired=False,
            subject_alternative_names=[],
            chain=[],
        )

    monkeypatch.setattr(monitor_service, "probe_ssl_async", _probe)
    await execute_check(mid, db, redis=redis)
    joined = " ".join(str(c.args) for c in redis.publish.call_args_list)
    assert "ssl_threshold" in joined
