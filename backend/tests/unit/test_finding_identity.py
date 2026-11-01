"""Stable scan finding rule IDs used by future risk observations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.finding_identity import (
    FINDING_RULESET_VERSION,
    _RULE_IDS,
    finding_rule_identity,
)
from app.services.security_analyzer import extract_key_findings


@pytest.mark.unit
def test_current_finding_variants_have_reviewed_rule_ids() -> None:
    expired = {
        "ssl": {"bits": 32, "valid_to": "Jan 1 2020 GMT"},
        "threats": {"safeBrowsing": {"unsafe": True}},
        "ports": {"openPorts": [21, 1433]},
        "headers": {},
        "hsts": {"compatible": False},
        "tls": {"connection": {"protocols": [{"name": "TLSv1.0", "supported": True}]}},
        "dnssec": {"enabled": False},
        "firewall": {"hasWaf": False},
        "security-txt": {"isPresent": False},
        "robots-txt": {"robots": []},
    }
    soon_date = datetime.now(timezone.utc) + timedelta(days=15)
    expiring = {
        "ssl": {"bits": 2048, "valid_to": soon_date.strftime("%Y-%m-%dT%H:%M:%SZ")},
        "ports": {"openPorts": [21], "behindProxy": True},
    }

    findings = [
        *extract_key_findings(expired, max_findings=None),
        *extract_key_findings(expiring, max_findings=None),
    ]
    identities = [finding_rule_identity(finding) for finding in findings]

    assert {(finding["module"], finding["title"]) for finding in findings} == set(_RULE_IDS)
    assert all(identity.rule_id for identity in identities)
    assert all(identity.ruleset_version == FINDING_RULESET_VERSION for identity in identities)
    assert {finding["title"] for finding in findings} >= {
        "SSL certificate expired",
        "SSL certificate expiring soon",
        "Port scan results may be inaccurate",
        "Missing Content-Security-Policy",
    }


@pytest.mark.unit
def test_ssl_expiry_identity_survives_severity_and_title_change() -> None:
    expiring = finding_rule_identity({"module": "ssl", "title": "SSL certificate expiring soon"})
    expired = finding_rule_identity({"module": "ssl", "title": "SSL certificate expired"})

    assert expiring == expired


@pytest.mark.unit
def test_unknown_finding_requires_explicit_rule_review() -> None:
    with pytest.raises(ValueError, match="Unmapped finding rule"):
        finding_rule_identity({"module": "ssl", "title": "New unreviewed SSL rule"})
