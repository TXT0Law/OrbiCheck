"""Security posture scoring for scan results.

Computes security_score (0–100 observable hardening), severity counts,
category summary, and key findings from raw OSINT module results
(V2 hybrid weighted model). Not a full risk (likelihood × impact) metric.
"""

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.models.scan import ModuleStatus, ScanStatus
from app.services.transformers import extract_tls_ciphers, extract_tls_protocols

logger = logging.getLogger(__name__)

# Category weights (must sum to 1.0)
CATEGORY_WEIGHTS: dict[str, float] = {
    "transport": 0.30,
    "http_security": 0.25,
    "threat_intel": 0.20,
    "infrastructure": 0.15,
    "best_practices": 0.10,
}

SEVERITY_CAP_CRITICAL = 39
SEVERITY_CAP_HIGH = 69

# Dangerous ports (trigger critical cap and infra category)
DANGEROUS_PORTS = frozenset({21, 23, 445, 3389})
# Risky database/VNC-style ports (infra category only, not critical cap)
RISKY_PORTS_INFRA = frozenset({1433, 3306, 5432, 5900})

# Security headers scored under HTTP Security (HSTS exclusive to Transport — no STS here)
HTTP_SECURITY_HEADER_KEYS = (
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
)

# Category definitions: module name -> category
SECURITY_MODULES = {
    "ssl",
    "tls",
    "headers",
    "http-security",
    "hsts",
    "cookies",
    "dnssec",
    "firewall",
    "security-txt",
    "threats",
    "block-lists",
}
NETWORK_MODULES = {
    "get-ip",
    "whois",
    "dns",
    "dns-server",
    "txt-records",
    "ports",
    "trace-route",
    "redirects",
    "status",
    "mail-config",
}
CONTENT_MODULES = {
    "screenshot",
    "page-source",
    "tech-stack",
    "features",
    "robots-txt",
    "sitemap",
    "linked-pages",
    "social-tags",
    "archives",
    "rank",
    "legacy-rank",
    "carbon",
}


@dataclass(frozen=True)
class SecurityScoreResult:
    """Full V2 security score output including category breakdown."""

    score: int
    base_score: float
    confidence: float
    severity_cap_applied: str | None
    category_scores: dict[str, float]


@dataclass(frozen=True)
class ResolvedSecurityScore:
    """Resolved score for API / persistence (breakdown only when freshly derived)."""

    score: int | None
    breakdown: SecurityScoreResult | None


def _ensure_dict(value: Any) -> dict:
    """Coerce value to dict, parsing JSON string if needed."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _get_headers_dict(raw_results: dict) -> dict:
    """Extract normalized headers from headers or http-security modules."""
    headers_raw = raw_results.get("headers") or raw_results.get("http-security")
    if isinstance(headers_raw, dict):
        return {k.lower(): v for k, v in headers_raw.items()}
    return {}


def _has_header(headers: dict, name: str) -> bool:
    """Check if header exists (case-insensitive)."""
    lower = name.lower()
    return any(k.lower() == lower and v for k, v in headers.items())


def _get_ssl_data(raw_results: dict) -> dict:
    """Extract SSL module data."""
    ssl_raw = raw_results.get("ssl")
    return _ensure_dict(ssl_raw)


def _days_until_expiry(valid_to: str) -> int | None:
    """Parse valid_to date and return days until expiry. None if invalid."""
    from datetime import datetime, timezone

    if not valid_to:
        return None
    try:
        for fmt in ("%b %d %H:%M:%S %Y GMT", "%b %d %Y GMT", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(valid_to, fmt).replace(tzinfo=timezone.utc)
                delta = dt - datetime.now(timezone.utc)
                return delta.days
            except ValueError:
                continue
    except (TypeError, ValueError):
        pass
    return None


def _ssl_grade_from_bits(bits: int) -> str:
    """Map key bits to SSL grade."""
    if bits >= 256:
        return "A+"
    if bits >= 128:
        return "A"
    if bits >= 64:
        return "B"
    return "C"


def _is_threat_listed(raw_results: dict) -> bool:
    """Check if domain/URL is listed in threat or block-list databases."""
    threats = _ensure_dict(raw_results.get("threats"))
    block_lists = _ensure_dict(raw_results.get("block-lists"))

    if threats.get("safeBrowsing") and _ensure_dict(threats["safeBrowsing"]).get("unsafe"):
        return True
    urlhaus = threats.get("urlHaus")
    if isinstance(urlhaus, dict) and not urlhaus.get("error"):
        if urlhaus.get("threats") or urlhaus.get("url_count", 0) > 0:
            return True
    phish = threats.get("phishTank")
    if isinstance(phish, dict) and str(phish.get("in_database", "")).lower() == "true":
        return True

    bl = block_lists.get("blocklists", block_lists)
    if isinstance(bl, list):
        return any(isinstance(item, dict) and item.get("isBlocked") for item in bl)
    return False


def _get_open_ports(raw_results: dict) -> list[int]:
    """Extract list of open ports from ports module."""
    ports_raw = raw_results.get("ports")
    ports_raw = _ensure_dict(ports_raw)
    open_ports = ports_raw.get("openPorts", [])
    if isinstance(open_ports, list):
        normalized = []
        for port in open_ports:
            if isinstance(port, dict) and isinstance(port.get("port"), (int, str)):
                normalized.append(int(port["port"]))
            elif isinstance(port, (int, str)):
                normalized.append(int(port))
        return normalized
    return []


def _get_ports_data(raw_results: dict) -> dict:
    """Extract normalized ports payload."""
    return _ensure_dict(raw_results.get("ports", {}))


def _is_ports_behind_proxy(raw_results: dict) -> bool:
    """Return True when the port scan is flagged as proxy/CDN-backed."""
    return bool(_get_ports_data(raw_results).get("behindProxy", False))


def _get_ports_proxy_provider(raw_results: dict) -> str | None:
    """Return detected proxy/CDN provider name when available."""
    provider = _get_ports_data(raw_results).get("proxyProvider")
    return str(provider) if provider else None


def _get_tls_raw(raw_results: dict) -> dict:
    """Normalize TLS module payload (unwrap optional data nesting)."""
    tls = _ensure_dict(raw_results.get("tls"))
    inner = tls.get("data")
    if isinstance(inner, dict):
        return inner
    return tls


def _has_http_to_https_redirect(raw_results: dict) -> bool:
    redirects = _ensure_dict(raw_results.get("redirects"))
    hops = redirects.get("hops", redirects.get("redirects", []))
    if not isinstance(hops, list) or len(hops) < 2:
        return False
    urls: list[str] = []
    for hop in hops:
        if isinstance(hop, str):
            urls.append(hop)
        elif isinstance(hop, dict):
            urls.append(str(hop.get("url", "")))
    for i in range(len(urls) - 1):
        if urls[i].lower().startswith("http://") and urls[i + 1].lower().startswith(
            "https://",
        ):
            return True
    return False


def _parse_set_cookie_flags(cookie_str: str) -> dict[str, bool | str]:
    """Minimal Set-Cookie parse for Secure / HttpOnly / SameSite."""
    lower = cookie_str.lower()
    same_site = "lax"
    if "samesite=strict" in lower:
        same_site = "strict"
    elif "samesite=lax" in lower:
        same_site = "lax"
    elif "samesite=none" in lower:
        same_site = "none"
    return {
        "secure": "secure" in lower,
        "httpOnly": "httponly" in lower,
        "sameSite": same_site,
    }


def _extract_cookies_for_scoring(raw_results: dict) -> list[dict[str, Any]]:
    """Normalize cookie payloads to {secure, httpOnly, sameSite} dicts."""
    cookies_mod = raw_results.get("cookies")
    if cookies_mod is None:
        return []
    raw = _ensure_dict(cookies_mod)
    inner = raw.get("data")
    if isinstance(inner, dict):
        raw = inner
    if raw.get("error") or raw.get("skipped"):
        return []

    out: list[dict[str, Any]] = []

    def push(d: dict) -> None:
        if not isinstance(d, dict):
            return
        ss = str(d.get("sameSite", "")).lower()
        if ss not in ("strict", "lax", "none"):
            ss = ""
        out.append(
            {
                "secure": bool(d.get("secure", False)),
                "httpOnly": bool(d.get("httpOnly", False)),
                "sameSite": ss,
            },
        )

    if isinstance(raw, list):
        for c in raw:
            if isinstance(c, dict):
                push(c)
        return out

    for key in ("cookies", "clientCookies"):
        arr = raw.get(key)
        if isinstance(arr, list):
            for c in arr:
                if isinstance(c, dict):
                    push(c)

    header_cookies = raw.get("headerCookies")
    if header_cookies is not None:
        headers_list = header_cookies if isinstance(header_cookies, list) else [header_cookies]
        for hv in headers_list:
            if isinstance(hv, str):
                push(_parse_set_cookie_flags(hv))

    return out


def _score_cookie_security(raw_results: dict) -> int:
    """Full 5 only when module ran and reported zero cookies (no cookie exposure)."""
    if "cookies" not in raw_results:
        return 0
    cookies = _extract_cookies_for_scoring(raw_results)
    if not cookies:
        return 5
    total = len(cookies)
    secure_count = sum(1 for c in cookies if c.get("secure"))
    httponly_count = sum(1 for c in cookies if c.get("httpOnly"))
    samesite_count = sum(
        1 for c in cookies if c.get("sameSite") in ("strict", "lax")
    )
    return round(
        5
        * (
            (secure_count / total) * 0.4
            + (httponly_count / total) * 0.4
            + (samesite_count / total) * 0.2
        ),
    )


def _score_transport_category(raw_results: dict) -> tuple[float, float]:
    """Return (earned, max) for transport; max is 35."""
    earned = 0.0
    max_pts = 35.0

    ssl = _get_ssl_data(raw_results)
    valid_to = ssl.get("valid_to", ssl.get("validTo", ""))
    days = _days_until_expiry(str(valid_to)) if valid_to else None
    if days is not None:
        if days < 0:
            earned += 0
        elif days <= 30:
            earned += 4
        elif days <= 90:
            earned += 7
        else:
            earned += 10
    else:
        earned += 0

    bits = int(ssl.get("bits", 0) or 0)
    if bits >= 256:
        earned += 6
    elif bits >= 128:
        earned += 4
    elif bits >= 64:
        earned += 2

    tls_raw = _get_tls_raw(raw_results)
    protocols = extract_tls_protocols(tls_raw)
    if protocols:
        has_danger = any(
            p.get("supported") and p.get("secure") == "danger" for p in protocols
        )
        has_warning = any(
            p.get("supported") and p.get("secure") == "warning" for p in protocols
        )
        if has_danger:
            earned += 0
        elif has_warning:
            earned += 3
        else:
            earned += 6

    ciphers = extract_tls_ciphers(tls_raw)
    weak_count = sum(1 for c in ciphers if c.get("strength") in ("weak", "insecure"))
    if weak_count == 0:
        earned += 4
    elif weak_count <= 2:
        earned += 2

    hsts = _ensure_dict(raw_results.get("hsts"))
    if hsts.get("compatible", False):
        if hsts.get("preload"):
            earned += 5
        elif hsts.get("includeSubDomains"):
            earned += 4
        else:
            earned += 2

    if _has_http_to_https_redirect(raw_results):
        earned += 4

    return earned, max_pts


def _score_http_security_category(raw_results: dict) -> tuple[float, float]:
    headers = _get_headers_dict(raw_results)
    earned = 0.0
    max_pts = 25.0
    if _has_header(headers, "content-security-policy"):
        earned += 8
    if _has_header(headers, "x-frame-options"):
        earned += 4
    if _has_header(headers, "x-content-type-options"):
        earned += 3
    if _has_header(headers, "referrer-policy"):
        earned += 3
    if _has_header(headers, "permissions-policy"):
        earned += 2
    earned += float(_score_cookie_security(raw_results))
    return earned, max_pts


def _threat_intel_safe_browsing_points(raw_results: dict) -> int:
    if "threats" not in raw_results:
        return 8
    threats = _ensure_dict(raw_results["threats"])
    sb = threats.get("safeBrowsing")
    if sb is None:
        return 8
    return 0 if _ensure_dict(sb).get("unsafe") else 8


def _threat_intel_urlhaus_phish_points(raw_results: dict) -> int:
    if "threats" not in raw_results:
        return 6
    threats = _ensure_dict(raw_results["threats"])
    urlhaus = threats.get("urlHaus")
    if isinstance(urlhaus, dict) and not urlhaus.get("error"):
        if urlhaus.get("threats") or urlhaus.get("url_count", 0) > 0:
            return 0
    phish = threats.get("phishTank")
    if isinstance(phish, dict) and str(phish.get("in_database", "")).lower() == "true":
        return 0
    return 6


def _threat_intel_blocklist_points(raw_results: dict) -> int:
    if "block-lists" not in raw_results:
        return 6
    block_lists = _ensure_dict(raw_results["block-lists"])
    bl = block_lists.get("blocklists", block_lists)
    if isinstance(bl, list):
        if any(isinstance(item, dict) and item.get("isBlocked") for item in bl):
            return 0
    return 6


def _score_threat_intel_category(raw_results: dict) -> tuple[float, float]:
    earned = float(
        _threat_intel_safe_browsing_points(raw_results)
        + _threat_intel_urlhaus_phish_points(raw_results)
        + _threat_intel_blocklist_points(raw_results),
    )
    return earned, 20.0


def _score_infrastructure_category(raw_results: dict) -> tuple[float, float]:
    earned = 0.0
    max_pts = 15.0

    open_ports: list[int] = []
    behind_proxy = _is_ports_behind_proxy(raw_results)
    if "ports" in raw_results:
        open_ports = _get_open_ports(raw_results)

    dangerous_open = any(p in DANGEROUS_PORTS for p in open_ports)
    if behind_proxy or not dangerous_open:
        earned += 5

    risky_open = any(p in RISKY_PORTS_INFRA for p in open_ports)
    if behind_proxy or not risky_open:
        earned += 3

    firewall = _ensure_dict(raw_results.get("firewall"))
    if firewall.get("hasWaf", False):
        earned += 4

    dnssec = _ensure_dict(raw_results.get("dnssec"))
    dnssec_ok = bool(dnssec.get("enabled", False))
    if not dnssec_ok:
        dnskey = dnssec.get("DNSKEY", {})
        ds = dnssec.get("DS", {})
        if isinstance(dnskey, dict) and dnskey.get("isFound"):
            dnssec_ok = True
        if isinstance(ds, dict) and ds.get("isFound"):
            dnssec_ok = True
    if dnssec_ok:
        earned += 3

    return earned, max_pts


def _score_best_practices_category(raw_results: dict) -> tuple[float, float]:
    earned = 0.0
    max_pts = 12.0

    sec_txt = _ensure_dict(raw_results.get("security-txt"))
    if sec_txt.get("isPresent", False):
        earned += 2

    robots = _ensure_dict(raw_results.get("robots-txt"))
    if robots.get("robots") and not robots.get("error") and not robots.get("skipped"):
        earned += 2

    mail = _ensure_dict(raw_results.get("mail-config"))
    spf = mail.get("spf", {})
    if isinstance(spf, dict) and spf.get("status") != "fail":
        earned += 3

    dkim = mail.get("dkim", {})
    if isinstance(dkim, dict) and dkim.get("found"):
        earned += 2

    dmarc = mail.get("dmarc", {})
    if isinstance(dmarc, dict) and dmarc.get("status") != "fail":
        earned += 3

    return earned, max_pts


def detect_ssl_expired(raw_results: dict) -> bool:
    ssl = _get_ssl_data(raw_results)
    if not ssl:
        return False
    days = _days_until_expiry(str(ssl.get("valid_to", ssl.get("validTo", ""))))
    return days is not None and days < 0


def detect_has_dangerous_ports(raw_results: dict) -> bool:
    if "ports" not in raw_results:
        return False
    if _is_ports_behind_proxy(raw_results):
        return False
    return any(p in DANGEROUS_PORTS for p in _get_open_ports(raw_results))


def detect_missing_csp(raw_results: dict) -> bool:
    return not _has_header(_get_headers_dict(raw_results), "content-security-policy")


def detect_hsts_not_enabled(raw_results: dict) -> bool:
    return not _ensure_dict(raw_results.get("hsts")).get("compatible", False)


def detect_ssl_bits_below_128(raw_results: dict) -> bool:
    ssl = _get_ssl_data(raw_results)
    if not ssl:
        return False
    return int(ssl.get("bits", 0) or 0) < 128


def detect_legacy_tls_supported(raw_results: dict) -> bool:
    tls_raw = _get_tls_raw(raw_results)
    for p in extract_tls_protocols(tls_raw):
        if p.get("supported") and p.get("secure") in ("warning", "danger"):
            return True
    return False


def compute_confidence(module_results: Sequence[Any] | None) -> float:
    """Return 0.0 – 1.0 confidence ratio."""
    if module_results is None:
        return 1.0
    total = len(module_results)
    if total == 0:
        return 0.0
    success = sum(1 for m in module_results if getattr(m, "status", None) == ModuleStatus.SUCCESS)
    return success / total


def apply_confidence(score: float, confidence: float) -> int:
    """Penalise score when data is incomplete."""
    if confidence >= 0.8:
        adjusted = score
    elif confidence >= 0.5:
        factor = 0.85 + 0.15 * ((confidence - 0.5) / 0.3)
        adjusted = score * factor
    elif confidence > 0:
        factor = 0.4 + 0.45 * (confidence / 0.5)
        adjusted = score * factor
    else:
        adjusted = 0.0

    return max(0, min(100, round(adjusted)))


def compute_security_score_v2(
    raw_results: dict,
    module_results: Sequence[Any] | None = None,
) -> SecurityScoreResult | None:
    """Compute security score using the hybrid model. Returns None if no raw data."""
    if not raw_results:
        return None

    tr_e, tr_m = _score_transport_category(raw_results)
    hs_e, hs_m = _score_http_security_category(raw_results)
    th_e, th_m = _score_threat_intel_category(raw_results)
    inf_e, inf_m = _score_infrastructure_category(raw_results)
    bp_e, bp_m = _score_best_practices_category(raw_results)

    transport_sub = (tr_e / tr_m) * 100 if tr_m else 0.0
    http_sec_sub = (hs_e / hs_m) * 100 if hs_m else 0.0
    threat_sub = (th_e / th_m) * 100 if th_m else 0.0
    infra_sub = (inf_e / inf_m) * 100 if inf_m else 0.0
    best_sub = (bp_e / bp_m) * 100 if bp_m else 0.0

    category_scores = {
        "transport": round(transport_sub, 4),
        "http_security": round(http_sec_sub, 4),
        "threat_intel": round(threat_sub, 4),
        "infrastructure": round(infra_sub, 4),
        "best_practices": round(best_sub, 4),
    }

    base_score = (
        CATEGORY_WEIGHTS["transport"] * transport_sub
        + CATEGORY_WEIGHTS["http_security"] * http_sec_sub
        + CATEGORY_WEIGHTS["threat_intel"] * threat_sub
        + CATEGORY_WEIGHTS["infrastructure"] * infra_sub
        + CATEGORY_WEIGHTS["best_practices"] * best_sub
    )

    ssl_expired = detect_ssl_expired(raw_results)
    is_listed = _is_threat_listed(raw_results)
    dangerous_ports = detect_has_dangerous_ports(raw_results)
    has_critical = ssl_expired or is_listed or dangerous_ports

    missing_csp = detect_missing_csp(raw_results)
    hsts_off = detect_hsts_not_enabled(raw_results)
    ssl_weak = detect_ssl_bits_below_128(raw_results)
    legacy_tls = detect_legacy_tls_supported(raw_results)
    has_high = missing_csp or hsts_off or ssl_weak or legacy_tls

    severity_cap: str | None = None
    after_cap = base_score
    if has_critical:
        severity_cap = "critical"
        after_cap = min(base_score, float(SEVERITY_CAP_CRITICAL))
    elif has_high:
        severity_cap = "high"
        after_cap = min(base_score, float(SEVERITY_CAP_HIGH))

    confidence = compute_confidence(module_results)
    final = apply_confidence(after_cap, confidence)

    return SecurityScoreResult(
        score=final,
        base_score=round(base_score, 4),
        confidence=round(confidence, 4),
        severity_cap_applied=severity_cap,
        category_scores=category_scores,
    )


def compute_security_score(raw_results: dict) -> int:
    """Compute 0–100 security score; wrapper over V2. Returns 0 when no data."""
    result = compute_security_score_v2(raw_results, None)
    return 0 if result is None else result.score


def _module_success_count(module_results: Sequence[Any]) -> int:
    return sum(1 for m in module_results if getattr(m, "status", None) == ModuleStatus.SUCCESS)


def resolve_security_score_for_detail(
    *,
    stored_score: int | None,
    scan_status: ScanStatus,
    module_results: Sequence[Any],
    all_raw: dict[str, Any],
    from_incomplete_run: bool = False,
) -> ResolvedSecurityScore:
    """Resolve security score for API detail or task finalization."""
    if stored_score is not None:
        return ResolvedSecurityScore(stored_score, None)

    success_count = _module_success_count(module_results)

    if from_incomplete_run:
        if success_count == 0:
            return ResolvedSecurityScore(0, None)
        try:
            v2 = compute_security_score_v2(all_raw, module_results)
            if v2 is None:
                return ResolvedSecurityScore(0, None)
            return ResolvedSecurityScore(v2.score, v2)
        except Exception as err:  # noqa: BLE001
            logger.exception("security_score derivation failed (incomplete run): %s", err)
            return ResolvedSecurityScore(0, None)

    if scan_status in (ScanStatus.PENDING, ScanStatus.RUNNING):
        return ResolvedSecurityScore(None, None)

    if success_count == 0:
        if scan_status == ScanStatus.FAILED:
            return ResolvedSecurityScore(0, None)
        return ResolvedSecurityScore(None, None)

    try:
        v2 = compute_security_score_v2(all_raw, module_results)
        if v2 is None:
            return ResolvedSecurityScore(0, None)
        return ResolvedSecurityScore(v2.score, v2)
    except Exception as err:  # noqa: BLE001
        logger.exception("security_score derivation failed: %s", err)
        return ResolvedSecurityScore(None, None)


def compute_severity_counts(raw_results: dict) -> dict:
    """Compute severity bucket counts from raw results.

    Returns: {critical, high, medium, low}
    """
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}

    if not raw_results:
        return counts

    if detect_ssl_expired(raw_results):
        counts["critical"] += 1

    if _is_threat_listed(raw_results):
        counts["critical"] += 1

    if detect_has_dangerous_ports(raw_results):
        counts["critical"] += 1

    if detect_missing_csp(raw_results):
        counts["high"] += 1

    if detect_hsts_not_enabled(raw_results):
        counts["high"] += 1

    ssl = _get_ssl_data(raw_results)
    if ssl:
        bits = int(ssl.get("bits", 0) or 0)
        if bits < 128:
            counts["high"] += 1

    if detect_legacy_tls_supported(raw_results):
        counts["high"] += 1

    headers = _get_headers_dict(raw_results)
    if not _has_header(headers, "x-frame-options"):
        counts["medium"] += 1
    if not _has_header(headers, "referrer-policy"):
        counts["medium"] += 1

    dnssec = _ensure_dict(raw_results.get("dnssec"))
    dnssec_enabled = bool(dnssec.get("enabled", False))
    if not dnssec_enabled:
        dnskey = dnssec.get("DNSKEY", {})
        ds = dnssec.get("DS", {})
        if isinstance(dnskey, dict) and dnskey.get("isFound"):
            dnssec_enabled = True
        if isinstance(ds, dict) and ds.get("isFound"):
            dnssec_enabled = True
    if not dnssec_enabled:
        counts["medium"] += 1

    if not _has_header(headers, "permissions-policy"):
        counts["low"] += 1

    sec_txt = _ensure_dict(raw_results.get("security-txt"))
    if not sec_txt.get("isPresent", False):
        counts["low"] += 1

    robots = _ensure_dict(raw_results.get("robots-txt"))
    if robots.get("skipped") or robots.get("error") or not robots.get("robots"):
        counts["low"] += 1

    return counts


def compute_category_summary(raw_results: dict) -> list[dict]:
    """Group modules into categories with checkedCount, issueCount, status.

    UI uses three buckets (Security / Network / Content) for legacy overview.
    V2 ``securityScoreBreakdown.categoryScores`` uses five weighted dimensions; unifying
    those models is deferred until the dashboard consumes both in one view.
    """
    categories = [
        ("Security", SECURITY_MODULES),
        ("Network", NETWORK_MODULES),
        ("Content", CONTENT_MODULES),
    ]

    result: list[dict] = []

    for cat_name, module_names in categories:
        checked_count = 0
        issue_count = 0

        for mod in module_names:
            data = raw_results.get(mod)
            if data is None:
                continue
            data = _ensure_dict(data)
            if data:
                checked_count += 1

        if cat_name == "Security":
            headers = _get_headers_dict(raw_results)
            for hdr in HTTP_SECURITY_HEADER_KEYS:
                if not _has_header(headers, hdr):
                    issue_count += 1
            if detect_hsts_not_enabled(raw_results):
                issue_count += 1
            ssl = _get_ssl_data(raw_results)
            if ssl:
                days = _days_until_expiry(str(ssl.get("valid_to", ssl.get("validTo", ""))))
                if days is not None and days < 0:
                    issue_count += 1
                if days is not None and 0 <= days <= 30:
                    issue_count += 1
                if int(ssl.get("bits", 0) or 0) < 128:
                    issue_count += 1
            if detect_legacy_tls_supported(raw_results):
                issue_count += 1
            cookies = _extract_cookies_for_scoring(raw_results)
            if cookies and _score_cookie_security(raw_results) < 3:
                issue_count += 1
            if _is_threat_listed(raw_results):
                issue_count += 1
            if not _ensure_dict(raw_results.get("firewall")).get("hasWaf"):
                issue_count += 1
            dnssec = _ensure_dict(raw_results.get("dnssec"))
            if not (
                dnssec.get("enabled")
                or _ensure_dict(dnssec.get("DNSKEY")).get("isFound")
                or _ensure_dict(dnssec.get("DS")).get("isFound")
            ):
                issue_count += 1
            if not _ensure_dict(raw_results.get("security-txt")).get("isPresent"):
                issue_count += 1

        elif cat_name == "Network":
            if "ports" in raw_results:
                open_ports = _get_open_ports(raw_results)
                if not _is_ports_behind_proxy(raw_results):
                    for p in open_ports:
                        if p in DANGEROUS_PORTS or p in RISKY_PORTS_INFRA:
                            issue_count += 1
            mail = _ensure_dict(raw_results.get("mail-config"))
            spf = mail.get("spf", {})
            if isinstance(spf, dict) and spf.get("status") == "fail":
                issue_count += 1

        elif cat_name == "Content":
            robots = _ensure_dict(raw_results.get("robots-txt"))
            if robots.get("skipped") or robots.get("error"):
                issue_count += 1
            sitemap = _ensure_dict(raw_results.get("sitemap"))
            if sitemap.get("skipped") or sitemap.get("error"):
                issue_count += 1

        status = "pass" if issue_count == 0 else ("warn" if issue_count <= 2 else "fail")

        result.append(
            {
                "category": cat_name.lower(),
                "label": cat_name,
                "modulesChecked": checked_count,
                "issuesFound": issue_count,
                "status": status,
            },
        )

    return result


def extract_key_findings(raw_results: dict, max_findings: int = 8) -> list[dict]:
    """Extract notable findings sorted by severity."""
    findings: list[dict] = []

    if not raw_results:
        return findings

    ssl = _get_ssl_data(raw_results)
    if ssl:
        days = _days_until_expiry(str(ssl.get("valid_to", ssl.get("validTo", ""))))
        if days is not None and days < 0:
            findings.append(
                {
                    "title": "SSL certificate expired",
                    "description": "The SSL certificate has expired.",
                    "severity": "critical",
                    "module": "ssl",
                },
            )
        elif days is not None and 0 <= days <= 30:
            findings.append(
                {
                    "title": "SSL certificate expiring soon",
                    "description": f"Certificate expires in {days} days.",
                    "severity": "high",
                    "module": "ssl",
                },
            )

    if _is_threat_listed(raw_results):
        findings.append(
            {
                "title": "Listed in threat/block-list database",
                "description": "Domain or URL is flagged by threat intelligence.",
                "severity": "critical",
                "module": "threats",
            },
        )

    open_ports = _get_open_ports(raw_results)
    behind_proxy = _is_ports_behind_proxy(raw_results)
    proxy_provider = _get_ports_proxy_provider(raw_results)
    dangerous = [p for p in open_ports if p in DANGEROUS_PORTS]
    if dangerous and not behind_proxy:
        findings.append(
            {
                "title": "Dangerous ports open",
                "description": f"Ports {sorted(dangerous)} are open.",
                "severity": "critical",
                "module": "ports",
            },
        )
    elif behind_proxy:
        provider_suffix = f" ({proxy_provider})" if proxy_provider else ""
        findings.append(
            {
                "title": "Port scan results may be inaccurate",
                "description": f"Target is behind CDN/proxy{provider_suffix}.",
                "severity": "info",
                "module": "ports",
            },
        )
    risky = [p for p in open_ports if p in RISKY_PORTS_INFRA]
    if risky and not behind_proxy:
        findings.append(
            {
                "title": "Risky ports open",
                "description": f"Ports {sorted(risky)} are open.",
                "severity": "high",
                "module": "ports",
            },
        )

    headers = _get_headers_dict(raw_results)
    if not _has_header(headers, "content-security-policy"):
        findings.append(
            {
                "title": "Missing Content-Security-Policy",
                "description": "CSP header is not set.",
                "severity": "high",
                "module": "headers",
            },
        )

    hsts = _ensure_dict(raw_results.get("hsts"))
    if not hsts.get("compatible", False):
        findings.append(
            {
                "title": "HSTS not enabled",
                "description": "Strict-Transport-Security is not properly configured.",
                "severity": "high",
                "module": "hsts",
            },
        )

    if ssl:
        grade = _ssl_grade_from_bits(int(ssl.get("bits", 0) or 0))
        if grade in ("C", "D", "E", "F"):
            findings.append(
                {
                    "title": "Weak SSL grade",
                    "description": f"SSL grade is {grade}.",
                    "severity": "high",
                    "module": "ssl",
                },
            )

    if detect_legacy_tls_supported(raw_results):
        findings.append(
            {
                "title": "Legacy TLS protocols enabled",
                "description": "Server supports deprecated TLS/SSL protocol versions.",
                "severity": "high",
                "module": "tls",
            },
        )

    if not _has_header(headers, "x-frame-options"):
        findings.append(
            {
                "title": "Missing X-Frame-Options",
                "description": "X-Frame-Options header is not set.",
                "severity": "medium",
                "module": "headers",
            },
        )
    if not _has_header(headers, "referrer-policy"):
        findings.append(
            {
                "title": "Missing Referrer-Policy",
                "description": "Referrer-Policy header is not set.",
                "severity": "medium",
                "module": "headers",
            },
        )

    dnssec = _ensure_dict(raw_results.get("dnssec"))
    dnssec_ok = dnssec.get("enabled") or _ensure_dict(dnssec.get("DNSKEY")).get("isFound")
    if not dnssec_ok:
        findings.append(
            {
                "title": "DNSSEC not enabled",
                "description": "DNSSEC is not configured for the domain.",
                "severity": "medium",
                "module": "dnssec",
            },
        )

    if not _ensure_dict(raw_results.get("firewall")).get("hasWaf"):
        findings.append(
            {
                "title": "No WAF detected",
                "description": "Web Application Firewall was not detected.",
                "severity": "medium",
                "module": "firewall",
            },
        )

    if not _has_header(headers, "permissions-policy"):
        findings.append(
            {
                "title": "Missing Permissions-Policy",
                "description": "Permissions-Policy header is not set.",
                "severity": "low",
                "module": "headers",
            },
        )
    if not _ensure_dict(raw_results.get("security-txt")).get("isPresent"):
        findings.append(
            {
                "title": "No security.txt",
                "description": "security.txt file was not found.",
                "severity": "low",
                "module": "security-txt",
            },
        )
    robots = _ensure_dict(raw_results.get("robots-txt"))
    if robots.get("skipped") or robots.get("error") or not robots.get("robots"):
        findings.append(
            {
                "title": "No robots.txt",
                "description": "robots.txt file was not found.",
                "severity": "low",
                "module": "robots-txt",
            },
        )

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: severity_order.get(f["severity"], 4))
    for idx, f in enumerate(findings[:max_findings]):
        f["id"] = f"{f.get('module', 'item')}-{idx}"
    return findings[:max_findings]
