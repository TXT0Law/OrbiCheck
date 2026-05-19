"""Default monitor capability config (camelCase keys in JSONB, aligned with shared TS types)."""

from __future__ import annotations

import copy
from typing import Any

CAPABILITY_KEYS = (
    "uptime_only",
    "content_change",
    "ssl_expiry",
    "visual_change",
    "dns_change",
    "ct_log",
)

# ── DNS / CT capability defaults (Phase 2.2 / 2.3) ─────────────────────────
DNS_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME", "MX", "NS", "TXT", "CAA")
DEFAULT_DNS_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME")
MAX_DNS_RECORD_TYPES: int = len(DNS_RECORD_TYPES)
MAX_DNS_NAMESERVERS: int = 8
MAX_CT_PINNED_SERIALS: int = 32
# X.509 serial numbers are positive integers up to 20 octets (RFC 5280) —
# i.e. up to 40 hex chars. Allow 64 to be lenient with non-conformant CAs.
# (Phase 2 originally pinned SHA-256 leaf fingerprints, but crt.sh JSON does
# NOT return them, so we pin on serial_number — see ct_log_service.py.)
CT_PIN_SERIAL_PATTERN: str = r"^[A-Fa-f0-9]{1,64}$"

# ── HTTP request extension caps (1.1) ──────────────────────────────────────
# Mirrored client-side in shared/schemas/monitor.ts; keep in sync when changing.
MAX_REQUEST_BODY_BYTES: int = 64 * 1024
MAX_REQUEST_HEADERS_COUNT: int = 32
MAX_REQUEST_HEADER_VALUE_LENGTH: int = 4096
MAX_REQUEST_HEADER_NAME_LENGTH: int = 128
FORBIDDEN_REQUEST_HEADERS: frozenset[str] = frozenset(
    {
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
        "upgrade",
        "proxy-connection",
        "te",
        "trailer",
    }
)
ALLOWED_HTTP_AUTH_SCHEMES: frozenset[str] = frozenset({"none", "bearer", "basic"})

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
            # C-3: notification trigger fields. None = no constraint; the helpers
            # treat missing keys as "no trigger configured" so existing monitors
            # see no behaviour change.
            "triggerWords": None,
            "ignoreWords": None,
            "triggerRegex": None,
            "extractors": None,
            "restock": {
                "enabled": False,
                "outOfStockKeywords": [],
                "inStockKeywords": [],
            },
            # C-5: rendered-DOM fetch toggle. ``"http"`` keeps the cheap path; the
            # ``"browser"`` value routes the probe through Playwright via the
            # scan-service. Validation enforces interval >= MIN_BROWSER_FETCH_INTERVAL_SECONDS
            # (300s) when this is "browser" — see backend/app/api/v1/schemas/monitor.py.
            "fetchMode": "http",
            "fetchOptions": None,
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
            # V-1: still attempt a screenshot when the probe failed so the
            # UI can render a "this is what we saw" diagnostic. The capture
            # is flagged is_diagnostic=True so it never poisons the dHash
            # baseline. Operators can opt out by setting this to False.
            "captureOnFailure": True,
            # V-10: perceptual hash algorithm. dHash is fast and stable;
            # pHash is more robust to compression artefacts; aHash is the
            # cheapest; wHash uses wavelets and is the most robust but
            # slowest. Switching algorithms re-baselines the monitor.
            "hashAlgorithm": "dhash",
            # V-11: list of percentage-based rectangles to mask before
            # hashing. Empty by default; the UI editor lets operators
            # ignore time / ad / chat widgets.
            "ignoreRegions": [],
            "waitFor": {"selector": None, "timeoutMs": 0},
            "steps": [],
        },
        "intervalOverrideSeconds": None,
    },
    "dns_change": {
        "enabled": False,
        "alert": {"enabled": True, "cooldownSeconds": 600, "quietHours": None},
        "thresholds": {
            # Record types to query on each probe cycle (subset of DNS_RECORD_TYPES).
            "recordTypes": list(DEFAULT_DNS_RECORD_TYPES),
            # Optional explicit resolvers (IPv4/IPv6); empty list = system default.
            "nameservers": [],
            # Resolver timeout per query.
            "queryTimeoutSeconds": 5,
            # Alert when a record set changes; first probe is treated as baseline.
            "alertOnChange": True,
        },
        "intervalOverrideSeconds": None,
    },
    "ct_log": {
        "enabled": False,
        "alert": {"enabled": True, "cooldownSeconds": 3600, "quietHours": None},
        "thresholds": {
            # Lower-case hex certificate serial numbers the operator pins. crt.sh
            # JSON returns serial_number (not the full leaf cert), so pinning on
            # the SHA-256 fingerprint would require a second HTTP request per
            # entry — pinning on serial keeps the probe one round-trip.
            # Empty list = no pinning, only "new certificate observed" is alerted.
            "pinnedSerials": [],
            # Maximum age for crt.sh entries to consider in a single poll.
            # Also doubles as the polling cooldown — see ct_log_service.py.
            "lookbackHours": 24,
            # Alert when a new CT entry is observed for the monitor's hostname.
            "alertOnNewEntry": True,
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
