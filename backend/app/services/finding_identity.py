"""Stable rule identities for scan findings across scans and presentation changes."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


# Persist alongside future observations so a ruleset change can be distinguished
# from a target change. Rule IDs stay stable when only copy or severity changes.
FINDING_RULESET_VERSION = 1

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
