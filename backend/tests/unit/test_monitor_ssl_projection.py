"""Boundary cases for the extracted SSL monitor projection helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.monitor_ssl_projection import (
    SslThresholds,
    _is_ssl_enabled,
    _snapshot_to_ssl_response,
    _ssl_thresholds_from_config,
)


@pytest.mark.unit
def test_ssl_thresholds_use_configured_values_and_defaults() -> None:
    configured = _ssl_thresholds_from_config(
        {"thresholds": {"warnDaysRemaining": 21, "criticalDaysRemaining": 3}}
    )
    defaults = _ssl_thresholds_from_config({"thresholds": "invalid"})

    assert configured == SslThresholds(21, 3)
    assert defaults.warn_days_remaining > defaults.critical_days_remaining


@pytest.mark.unit
@pytest.mark.parametrize(
    ("enabled_capabilities", "config", "expected"),
    [
        ([], {"ssl_expiry": {"enabled": True}}, False),
        (["ssl_expiry"], {"ssl_expiry": {"enabled": False}}, False),
        (["ssl_expiry"], {"ssl_expiry": True}, True),
        (["ssl_expiry"], {"ssl_expiry": {}}, True),
    ],
)
def test_ssl_enabled_requires_capability_and_config(
    enabled_capabilities: list[str], config: dict[str, object], expected: bool
) -> None:
    monitor = SimpleNamespace(enabled_capabilities=enabled_capabilities, capabilities=config)
    assert _is_ssl_enabled(monitor) is expected


@pytest.mark.unit
def test_snapshot_projection_filters_invalid_chain_entries_and_marks_expiry() -> None:
    checked_at = datetime.now(timezone.utc)
    response = _snapshot_to_ssl_response(
        {
            "success": True,
            "days_remaining": 2,
            "is_valid": True,
            "chain": ["invalid", {"subject_dn": "CN=leaf"}],
        },
        checked_at,
        SslThresholds(30, 7),
    )

    assert response.severity_level == "critical"
    assert response.is_expiring_soon is True
    assert response.chain_summary[0].subject_dn == "CN=leaf"
    assert response.chain_summary[0].position == 1
    assert response.chain_summary[0].is_leaf is False
    assert response.last_checked_at == checked_at
