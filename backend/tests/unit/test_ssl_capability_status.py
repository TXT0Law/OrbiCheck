"""Tests for SSL capability card derivation from latest check snapshot."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import Monitor, MonitorCheck, MonitorStatus
from app.services.monitor_service import _compute_capability_statuses


@pytest.mark.unit
def test_ssl_capability_disabled_when_not_enabled() -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["uptime_only"])
    m = Monitor(
        id=mid,
        user_id=1,
        display_name="x",
        url="https://x.com",
        capabilities=caps,
        enabled_capabilities=["uptime_only"],
        interval_seconds=60,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )
    rows = _compute_capability_statuses(m, ["uptime_only"], caps, latest_ssl_check=None)
    ssl_row = next(x for x in rows if x.capability == "ssl_expiry")
    assert ssl_row.status == "disabled"


@pytest.mark.unit
def test_ssl_capability_pending_without_snapshot() -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    m = Monitor(
        id=mid,
        user_id=1,
        display_name="x",
        url="https://x.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=60,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
        ssl_expiry_days=None,
    )
    rows = _compute_capability_statuses(m, ["ssl_expiry"], caps, latest_ssl_check=None)
    ssl_row = next(x for x in rows if x.capability == "ssl_expiry")
    assert ssl_row.status == "pending"


@pytest.mark.unit
def test_ssl_capability_from_failed_snapshot() -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    m = Monitor(
        id=mid,
        user_id=1,
        display_name="x",
        url="https://x.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=60,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )
    chk = MonitorCheck(
        id=uuid4(),
        monitor_id=mid,
        success=False,
        response_time_ms=0.0,
        content_changed=False,
        evaluated_capabilities=["ssl_expiry"],
        ssl_snapshot={"success": False, "error_type": "SSL_TIMEOUT"},
    )
    chk.checked_at = datetime.now(timezone.utc)
    rows = _compute_capability_statuses(
        m, ["ssl_expiry"], caps, latest_ssl_check=chk
    )
    ssl_row = next(x for x in rows if x.capability == "ssl_expiry")
    assert ssl_row.status == "error"
    assert "SSL_TIMEOUT" in (ssl_row.summary or "")
