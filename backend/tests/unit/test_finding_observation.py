"""Evidence and idempotency rules for projected scan risk observations."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.scan import ModuleStatus, ScanStatus
from app.services.finding_observation import build_finding_observations


def _scan(
    *rows: SimpleNamespace,
    status: ScanStatus = ScanStatus.COMPLETED,
    completed_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        status=status,
        completed_at=completed_at or datetime.now(timezone.utc),
        module_results=list(rows),
    )


def _module(
    name: str, raw: dict | None, status: ModuleStatus = ModuleStatus.SUCCESS
) -> SimpleNamespace:
    return SimpleNamespace(module_name=name, raw_result=raw, status=status)


@pytest.mark.unit
def test_projection_only_records_findings_with_successful_module_evidence() -> None:
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        _module("headers", None, ModuleStatus.FAILED),
        _module("hsts", None, ModuleStatus.TIMEOUT),
    )

    observations = build_finding_observations(scan)

    assert [row.rule_id for row in observations] == ["ssl.certificate_expiry"]
    assert observations[0].evidence_modules == ("ssl",)
    assert observations[0].user_id == scan.user_id
    assert observations[0].domain == scan.domain
    assert observations[0].observed_at == scan.completed_at


@pytest.mark.unit
def test_projection_excludes_skipped_module_results() -> None:
    skipped = {"skipped": True, "data": {"note": "Skipped by user"}}
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        _module("headers", skipped),
        _module("hsts", skipped),
        _module("dnssec", skipped),
        _module("firewall", skipped),
    )

    assert [row.rule_id for row in build_finding_observations(scan)] == [
        "ssl.certificate_expiry"
    ]


@pytest.mark.unit
def test_projection_attributes_only_sources_that_support_a_shared_finding() -> None:
    scan = _scan(
        _module("headers", {"X-Frame-Options": "DENY"}),
        _module("http-security", {"Content-Security-Policy": "default-src 'self'"}),
        _module("threats", {"safeBrowsing": {"unsafe": True}}),
        _module("block-lists", {"blocklists": [{"isBlocked": False}]}),
    )

    observations = {row.rule_id: row for row in build_finding_observations(scan)}

    assert observations["headers.missing_csp"].evidence_modules == ("headers",)
    assert observations["threats.listed"].evidence_modules == ("threats",)


@pytest.mark.unit
def test_projection_has_stable_scan_rule_idempotency_key() -> None:
    scan = _scan(_module("http-security", {}))

    first = build_finding_observations(scan)
    repeated = build_finding_observations(scan)

    assert first == repeated
    assert first
    assert all(row.evidence_modules == ("http-security",) for row in first)
    assert len({row.idempotency_key for row in first}) == len(first)
    assert all(key[0] == scan.id for key in (row.idempotency_key for row in first))


@pytest.mark.unit
def test_projection_skips_noncompleted_scans() -> None:
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        status=ScanStatus.CANCELLED,
    )

    assert build_finding_observations(scan) == []


@pytest.mark.unit
def test_projection_rejects_completed_scan_without_completion_time() -> None:
    scan = _scan(_module("headers", {}))
    scan.completed_at = None

    with pytest.raises(ValueError, match="completed_at"):
        build_finding_observations(scan)
