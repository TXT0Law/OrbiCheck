"""Default monitor capability config (camelCase keys in JSONB, aligned with shared TS types)."""

from __future__ import annotations

import copy
from typing import Any

CAPABILITY_KEYS = ("uptime_only", "content_change", "ssl_expiry", "visual_change")

DEFAULT_CAPABILITIES: dict[str, Any] = {
    "uptime_only": {
        "enabled": False,
        "alert": {"enabled": True, "cooldownSeconds": 300, "quietHours": None},
        "thresholds": {
            "maxResponseTimeMs": 5000,
            "consecutiveFailures": 3,
            "alertOnUnexpectedStatus": True,
            "sloTargetPercent": 99.9,
        },
        "intervalOverrideSeconds": None,
    },
    "content_change": {
        "enabled": False,
        "alert": {"enabled": True, "cooldownSeconds": 300, "quietHours": None},
        "thresholds": {
            "alertOnChange": True,
            "minChangeSizeBytes": None,
            "normalizeVolatileTokens": True,
            "suppressDegradedPageChanges": True,
        },
        "intervalOverrideSeconds": None,
    },
    "ssl_expiry": {
        "enabled": False,
        "alert": {"enabled": True, "cooldownSeconds": 3600, "quietHours": None},
        "thresholds": {"warnDaysRemaining": 30, "criticalDaysRemaining": 7},
        "intervalOverrideSeconds": None,
    },
    "visual_change": {
        "enabled": False,
        "alert": {"enabled": False, "cooldownSeconds": 300, "quietHours": None},
        "thresholds": {
            "similarityThresholdPercent": 92.0,
            "viewportWidth": 1280,
            "viewportHeight": 720,
            "fullPage": False,
            "contentCorrelationWindowSeconds": None,
        },
        "intervalOverrideSeconds": None,
    },
}


def capabilities_from_enabled_list(enabled: list[str]) -> dict[str, Any]:
    out = copy.deepcopy(DEFAULT_CAPABILITIES)
    en = set(enabled)
    for k in CAPABILITY_KEYS:
        out[k]["enabled"] = k in en
    return out


def merge_capability_dict(base: dict[str, Any], patch: dict[str, Any] | None) -> dict[str, Any]:
    if not patch:
        if isinstance(base, dict) and base:
            return copy.deepcopy(base)
        return copy.deepcopy(DEFAULT_CAPABILITIES)
    if not isinstance(base, dict) or not base:
        out = copy.deepcopy(DEFAULT_CAPABILITIES)
    else:
        out = copy.deepcopy(base)
    for key in CAPABILITY_KEYS:
        if key not in out or not isinstance(out.get(key), dict):
            out[key] = copy.deepcopy(DEFAULT_CAPABILITIES[key])
    for key in CAPABILITY_KEYS:
        p = patch.get(key)
        if not p or not isinstance(p, dict):
            continue
        cur = out[key]
        p = dict(p)
        # Do not let stale JSON `enabled` overwrite the base (from enabled_capabilities).
        p.pop("enabled", None)
        merged = {**cur, **p}
        merged["enabled"] = cur.get("enabled", False)
        if "alert" in p and isinstance(p["alert"], dict):
            merged["alert"] = {**cur.get("alert", {}), **p["alert"]}
        if "thresholds" in p and isinstance(p["thresholds"], dict):
            merged["thresholds"] = {**cur.get("thresholds", {}), **p["thresholds"]}
        out[key] = merged
    return out


def capabilities_from_legacy_check_type(check_type: str) -> dict[str, Any]:
    """Single-select migration: only the legacy check_type capability is enabled."""
    out = capabilities_from_enabled_list([check_type])
    return out
