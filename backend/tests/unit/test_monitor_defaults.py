"""Unit tests for monitor capability defaults and merge helpers."""

from app.core.monitor_defaults import (
    CAPABILITY_KEYS,
    capabilities_from_enabled_list,
    merge_capability_dict,
)


def test_capabilities_from_enabled_list_sets_flags() -> None:
    caps = capabilities_from_enabled_list(["uptime_only", "ssl_expiry"])
    assert caps["uptime_only"]["enabled"] is True
    assert caps["ssl_expiry"]["enabled"] is True
    assert caps["content_change"]["enabled"] is False
    assert caps["dns_change"]["enabled"] is False
    assert caps["ct_log"]["enabled"] is False
    assert len(CAPABILITY_KEYS) == 6


def test_merge_capability_dict_preserves_structure() -> None:
    base = capabilities_from_enabled_list(["uptime_only"])
    patch = {
        "uptime_only": {
            "thresholds": {"maxResponseTimeMs": 5000},
            "alert": {"cooldownSeconds": 120},
        }
    }
    out = merge_capability_dict(base, patch)
    assert out["uptime_only"]["thresholds"]["maxResponseTimeMs"] == 5000
    assert out["uptime_only"]["alert"]["cooldownSeconds"] == 120
    assert out["uptime_only"]["alert"]["enabled"] is True


def test_merge_ignores_stale_enabled_from_patch() -> None:
    base = capabilities_from_enabled_list(["ssl_expiry"])
    patch = {"ssl_expiry": {"enabled": False, "thresholds": {"warnDaysRemaining": 14}}}
    out = merge_capability_dict(base, patch)
    assert out["ssl_expiry"]["enabled"] is True
    assert out["ssl_expiry"]["thresholds"]["warnDaysRemaining"] == 14
