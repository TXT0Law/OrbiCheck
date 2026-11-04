"""Stable rule identities for scan findings across scans and presentation changes."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.services.scan_evidence import normalize_raw_results, observed_dnssec, observed_hsts
from app.services.security_analyzer import (
    _days_until_expiry,
    _ssl_bits,
    extract_key_findings,
    observed_header,
)


# Persist alongside future observations so a ruleset change can be distinguished
# from a target change. Rule IDs stay stable when only copy or severity changes.
FINDING_RULESET_VERSION = 2

_RULE_IDS: dict[tuple[str, str], str] = {
    ("ssl", "SSL certificate expired"): "ssl.certificate_expiry",
    ("ssl", "SSL certificate expiring soon"): "ssl.certificate_expiry",
    ("ssl", "Weak SSL grade"): "ssl.weak_grade",
    ("threats", "Listed in threat/block-list database"): "threats.listed",
    ("ports", "Dangerous ports open"): "ports.dangerous_open",
    ("ports", "Port scan results may be inaccurate"): "ports.proxy_inaccurate",
    ("ports", "Risky ports open"): "ports.risky_open",
    ("headers", "Missing Content-Security-Policy"): "headers.missing_csp",
    ("headers", "Missing X-Frame-Options"): "headers.missing_x_frame_options",
    ("headers", "Missing Referrer-Policy"): "headers.missing_referrer_policy",
    ("headers", "Missing Permissions-Policy"): "headers.missing_permissions_policy",
    ("hsts", "HSTS not enabled"): "hsts.disabled",
    ("tls", "Legacy TLS protocols enabled"): "tls.legacy_protocols",
    ("dnssec", "DNSSEC not enabled"): "dnssec.disabled",
    ("firewall", "No WAF detected"): "firewall.no_waf",
    ("security-txt", "No security.txt"): "security_txt.missing",
    ("robots-txt", "No robots.txt"): "robots_txt.missing",
}
MAX_FINDING_RULES = len(set(_RULE_IDS.values()))

_EVIDENCE_MODULES: dict[str, frozenset[str]] = {
    "headers": frozenset({"headers", "http-security"}),
    "threats": frozenset({"threats", "block-lists"}),
    "hsts": frozenset({"hsts", "headers"}),
}


@dataclass(frozen=True, slots=True)
class FindingRuleIdentity:
    rule_id: str
    ruleset_version: int


def finding_rule_identity(finding: Mapping[str, object]) -> FindingRuleIdentity:
    """Resolve a finding to a reviewed rule ID; fail closed for unknown rules."""
    module = finding.get("module")
    title = finding.get("title")
    if not isinstance(module, str) or not isinstance(title, str):
        raise ValueError("Finding must contain a module and title")
    try:
        rule_id = _RULE_IDS[(module, title)]
    except KeyError as exc:
        raise ValueError(f"Unmapped finding rule: {module} / {title}") from exc
    return FindingRuleIdentity(rule_id=rule_id, ruleset_version=FINDING_RULESET_VERSION)


def finding_evidence_modules(
    finding: Mapping[str, object], raw_results: Mapping[str, dict]
) -> frozenset[str]:
    """Return source modules that independently support this finding."""
    raw_results = normalize_raw_results(raw_results)
    module = finding.get("module")
    if not isinstance(module, str):
        return frozenset()
    sources = _EVIDENCE_MODULES.get(module, frozenset({module}))
    if module not in _EVIDENCE_MODULES:
        return frozenset({module}) if module in raw_results else frozenset()

    return frozenset(
        source
        for source in sources
        if source in raw_results
        and any(
            candidate.get("module") == module
            and candidate.get("title") == finding.get("title")
            for candidate in extract_key_findings(
                {source: raw_results[source]}, max_findings=None
            )
        )
    )


_HEADER_RULE_NAMES = {
    "headers.missing_csp": "content-security-policy",
    "headers.missing_x_frame_options": "x-frame-options",
    "headers.missing_referrer_policy": "referrer-policy",
    "headers.missing_permissions_policy": "permissions-policy",
}


def finding_was_measured(
    finding: Mapping[str, object], raw_results: Mapping[str, dict]
) -> bool:
    """Require an observation of the rule's field before claiming a change."""
    observed = normalize_raw_results(raw_results)
    try:
        identity = finding_rule_identity(finding)
    except ValueError:
        return finding.get("module") in observed
    header = _HEADER_RULE_NAMES.get(identity.rule_id)
    if header is not None:
        return observed_header(observed, header) is not None
    if identity.rule_id == "hsts.disabled":
        return observed_hsts(observed) is not None
    if identity.rule_id == "ssl.certificate_expiry":
        ssl = observed.get("ssl", {})
        return _days_until_expiry(str(ssl.get("valid_to", ssl.get("validTo", "")))) is not None
    if identity.rule_id == "ssl.weak_grade":
        return _ssl_bits(observed) is not None
    module = str(finding.get("module") or "")
    raw = observed.get(module, {})
    if identity.rule_id == "dnssec.disabled":
        return observed_dnssec(raw) is not None
    if identity.rule_id == "firewall.no_waf":
        return isinstance(raw.get("hasWaf"), bool)
    if identity.rule_id == "security_txt.missing":
        return isinstance(raw.get("isPresent"), bool)
    if identity.rule_id == "robots_txt.missing":
        return isinstance(raw.get("robots"), list)
    if identity.rule_id.startswith("ports."):
        return isinstance(raw.get("openPorts"), list)
    if identity.rule_id == "tls.legacy_protocols":
        connection = raw.get("connection")
        return (isinstance(connection, dict) and isinstance(connection.get("protocols"), list)) or isinstance(raw.get("protocols"), list)
    return module in observed


def finding_measurement_coverage(raw_results: Mapping[str, dict]) -> frozenset[str]:
    """Compare rule coverage, ignoring unrelated response metadata."""
    return frozenset(
        rule_id
        for (module, title), rule_id in _RULE_IDS.items()
        if finding_was_measured({"module": module, "title": title}, raw_results)
    )
