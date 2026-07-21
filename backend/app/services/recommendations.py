"""Shared recommendations generator for scan reports.

Used by both ``GET /scans/{id}/detail`` (live web summary) and
``services/report_service`` (offline PDF/Markdown), so users see the
same actionable advice on the dashboard and inside downloaded reports
using stable module and severity inputs.

Inputs are the transformed ``scan_detail`` dict and the pre-computed
``key_findings`` list. The function is pure: no DB / Celery / IO.
"""

from __future__ import annotations

# Severity ordering used to sort the produced recommendations list.
# Mirrors the ScanSeverity ordering documented in shared/types/scan.ts.
SEVERITY_ORDER: dict[str, int] = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
    "info": 4,
}

# Public-facing TCP ports treated as critical when reachable.
DANGEROUS_PORTS: frozenset[int] = frozenset({21, 23, 445, 3389})

# Maximum number of recommendations returned to the client / report.
MAX_RECOMMENDATIONS = 6

# SSL daysRemaining thresholds for severity escalation.
SSL_EXPIRED_DAYS_THRESHOLD = 0
SSL_EXPIRING_SOON_DAYS_THRESHOLD = 30

# How many missing header names to inline into the description text.
HEADER_PREVIEW_LIMIT = 4

# Number of fallback findings borrowed when no rule fires.
FALLBACK_FINDINGS_LIMIT = 3

# Sentinel slot in the severity ordering map for unknown severities.
_UNKNOWN_SEVERITY_RANK = 99


def _port_entries(value: object) -> list[dict]:
    """Extract dict-shaped port entries from a transformed ports payload."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        entries = value.get("entries", [])
        if isinstance(entries, list):
            return [item for item in entries if isinstance(item, dict)]
    return []


def _ssl_recommendation(scan_detail: dict) -> dict | None:
    ssl = scan_detail.get("ssl") or {}
    days_remaining = ssl.get("daysRemaining")
    if not isinstance(days_remaining, int):
        return None
    if days_remaining < SSL_EXPIRED_DAYS_THRESHOLD:
        return {
            "severity": "critical",
            "title": "Replace expired SSL certificate",
            "description": "Renew the public certificate and deploy the full chain immediately.",
        }
    if days_remaining <= SSL_EXPIRING_SOON_DAYS_THRESHOLD:
        return {
            "severity": "high",
            "title": "Renew SSL certificate soon",
            "description": "Schedule certificate rotation before the remaining validity window closes.",
        }
    return None


def _missing_header_recommendation(scan_detail: dict) -> dict | None:
    headers = scan_detail.get("headers") or {}
    if not isinstance(headers, dict):
        return None
    security_checks = headers.get("securityChecks", [])
    missing = [
        check.get("name")
        for check in security_checks
        if isinstance(check, dict) and check.get("status") in {"missing", "fail"}
    ]
    if not missing:
        return None
    preview = ", ".join(str(name) for name in missing[:HEADER_PREVIEW_LIMIT])
    return {
        "severity": "high",
        "title": "Harden HTTP response headers",
        "description": f"Add or fix key headers such as {preview}.",
    }


def _dangerous_ports_recommendation(scan_detail: dict) -> dict | None:
    ports = _port_entries(scan_detail.get("ports"))
    dangerous = [
        port.get("port")
        for port in ports
        if isinstance(port, dict) and port.get("port") in DANGEROUS_PORTS
    ]
    if not dangerous:
        return None
    return {
        "severity": "critical",
        "title": "Restrict dangerous public ports",
        "description": (
            "Review exposed services and close or filter "
            f"ports {', '.join(str(port) for port in dangerous)}."
        ),
    }


def _dnssec_recommendation(scan_detail: dict) -> dict | None:
    dnssec = scan_detail.get("dnssec") or {}
    enabled = bool(dnssec.get("enabled")) if isinstance(dnssec, dict) else False
    if enabled:
        return None
    return {
        "severity": "medium",
        "title": "Enable DNSSEC validation",
        "description": "Protect DNS integrity by signing the zone and publishing DS records.",
    }


def _fallback_from_findings(key_findings: list[dict]) -> list[dict]:
    fallbacks: list[dict] = []
    for finding in key_findings[:FALLBACK_FINDINGS_LIMIT]:
        fallbacks.append(
            {
                "severity": finding.get("severity", "medium"),
                "title": finding.get("title", "Review top finding"),
                "description": finding.get(
                    "description",
                    "Investigate the highlighted issue.",
                ),
            }
        )
    return fallbacks


def generate_recommendations(
    scan_detail: dict,
    key_findings: list[dict],
) -> list[dict]:
    """Return up to MAX_RECOMMENDATIONS actionable items, sorted by severity.

    Rules are evaluated in stable order; when no rule fires the function falls
    back to the top ``FALLBACK_FINDINGS_LIMIT`` key findings so the UI is never
    empty when there is at least some scan data.
    """
    recommendations: list[dict] = []

    for builder in (
        _ssl_recommendation,
        _missing_header_recommendation,
        _dangerous_ports_recommendation,
        _dnssec_recommendation,
    ):
        item = builder(scan_detail)
        if item is not None:
            recommendations.append(item)

    if not recommendations:
        recommendations.extend(_fallback_from_findings(key_findings))

    recommendations.sort(
        key=lambda item: SEVERITY_ORDER.get(item.get("severity", ""), _UNKNOWN_SEVERITY_RANK)
    )
    return recommendations[:MAX_RECOMMENDATIONS]
