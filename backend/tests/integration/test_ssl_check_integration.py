"""Integration-style test: manual check persists ssl_snapshot (mocked probe)."""

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
@pytest.mark.integration
async def test_execute_check_persists_ssl_snapshot(monkeypatch) -> None:
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
        status=MonitorStatus.PENDING,
        tags=[],
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

    async def _probe(*_a, **_kw):
        return SslProbeResult(
            success=True,
            hostname="example.com",
            port=443,
            probe_time_ms=9.0,
            days_remaining=60,
            not_before="2025-01-01T00:00:00+00:00",
            not_after="2027-01-01T00:00:00+00:00",
            subject_dn="CN=example.com",
            issuer_dn="CN=ca",
            serial_number="ff",
            signature_algorithm="sha256",
            sha256_fingerprint="11:22",
            is_valid=True,
            is_expired=False,
            subject_alternative_names=["example.com"],
            chain=[],
        )

    monkeypatch.setattr(monitor_service, "probe_ssl_async", _probe)
    chk = await execute_check(mid, db, redis=None)
    assert chk is not None
    assert chk.ssl_snapshot is not None
    assert chk.ssl_snapshot.get("days_remaining") == 60
    assert chk.ssl_days_remaining == 60
    assert mon.ssl_expiry_days == 60
