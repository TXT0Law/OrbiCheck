"""Unit tests for the same-domain timeline + scan-to-scan diff helpers (T5.1 / T5.2).

Covers the pure ``compute_scan_diff`` helper plus the timeline normalisation
helpers. Database-driven ``get_domain_timeline`` paths are exercised in the
integration suite (``test_scan_timeline_diff_api.py``).
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.models.scan import ModuleStatus, ScanStatus
from app.services.scan_trend import (
    DEFAULT_TIMELINE_LIMIT,
    DIFF_KEY_FINDINGS_LIMIT,
    MAX_TIMELINE_LIMIT,
    TIMELINE_RANGE_DAYS,
    compute_scan_diff,
)


# ─── Helpers ─────────────────────────────────────────────────────────────


def _module(
    name: str,
    *,
    raw: dict | None,
    status: ModuleStatus = ModuleStatus.SUCCESS,
) -> SimpleNamespace:
    return SimpleNamespace(
        module_name=name,
        status=status,
        raw_result=raw,
        error_message=None,
        duration_ms=120,
        completed_at=datetime.now(timezone.utc),
    )


def _scan(
    *,
    scan_id: UUID | None = None,
    security_score: int | None = 78,
    completed_at: datetime | None = None,
    module_results: list[SimpleNamespace] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=scan_id or uuid4(),
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        security_score=security_score,
        progress=100,
        total_modules=3,
        completed_modules=3,
        error_message=None,
        started_at=completed_at,
        completed_at=completed_at or datetime(2026, 5, 1, tzinfo=timezone.utc),
        created_at=completed_at or datetime(2026, 5, 1, tzinfo=timezone.utc),
        scan_options=None,
        celery_task_id=None,
        module_results=module_results or [],
    )


def _ssl_module(days_remaining: int) -> SimpleNamespace:
    """Build an SSL module raw result whose ``valid_to`` is in N days from now.

    ``compute_severity_counts`` and ``extract_key_findings`` derive
    ``daysUntilExpiry`` from a parsed date string, so we can't rely on a
    pre-computed ``daysRemaining`` field — we have to actually generate a
    plausible ``valid_to`` timestamp.
    """
    from datetime import timedelta

    valid_to = datetime.now(timezone.utc) + timedelta(days=days_remaining)
    return _module(
        "ssl",
        raw={
            "subject": "CN=example.com",
            "issuer": "CN=Test CA",
            "valid_to": valid_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "bits": 2048,
        },
    )


# ─── compute_scan_diff ───────────────────────────────────────────────────


@pytest.mark.unit
def test_compute_scan_diff_returns_no_added_or_removed_when_modules_equal() -> None:
    base = _scan(module_results=[_ssl_module(days_remaining=200)])
    compare = _scan(module_results=[_ssl_module(days_remaining=200)])

    diff = compute_scan_diff(base, compare)

    assert diff["addedFindings"] == []
    assert diff["removedFindings"] == []
    assert diff["severityDelta"]["delta"] == {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
    }


@pytest.mark.unit
def test_compute_scan_diff_flags_new_critical_when_cert_expires_in_compare() -> None:
    """A scan that adds an expired SSL cert must surface a new finding."""
    base = _scan(module_results=[_ssl_module(days_remaining=200)])
    compare = _scan(module_results=[_ssl_module(days_remaining=-10)])

    diff = compute_scan_diff(base, compare)

    titles_added = {item["title"] for item in diff["addedFindings"]}
    assert "SSL certificate expired" in titles_added
    assert diff["severityDelta"]["delta"]["critical"] >= 1
    # No prior critical SSL finding → removedFindings stays empty for SSL.
    assert all(
        item["title"] != "SSL certificate expired"
        for item in diff["removedFindings"]
    )


@pytest.mark.unit
def test_compute_scan_diff_flags_removed_finding_when_compare_recovers() -> None:
    """When the new scan no longer has an issue, it shows up under removed."""
    base = _scan(module_results=[_ssl_module(days_remaining=-10)])
    compare = _scan(module_results=[_ssl_module(days_remaining=200)])

    diff = compute_scan_diff(base, compare)

    titles_removed = {item["title"] for item in diff["removedFindings"]}
    assert "SSL certificate expired" in titles_removed
    assert diff["severityDelta"]["delta"]["critical"] <= -1


@pytest.mark.unit
def test_compute_scan_diff_skips_pending_module_results() -> None:
    """Only SUCCESS module rows feed the diff so partial scans don't lie."""
    base_pending_ssl = _module("ssl", raw=None, status=ModuleStatus.PENDING)
    base = _scan(module_results=[base_pending_ssl])
    compare = _scan(module_results=[_ssl_module(days_remaining=-10)])

    diff = compute_scan_diff(base, compare)

    # The base scan has no SUCCESS modules, so any new finding in the
    # compare scan must show up under addedFindings.
    titles_added = {item["title"] for item in diff["addedFindings"]}
    assert "SSL certificate expired" in titles_added


@pytest.mark.unit
def test_compute_scan_diff_returns_camelcase_breakdown_keys() -> None:
    """``categoryScores`` keys must mirror ``shared/types/scan.ts``."""
    base = _scan(module_results=[_ssl_module(days_remaining=200)])
    compare = _scan(module_results=[_ssl_module(days_remaining=200)])

    diff = compute_scan_diff(base, compare)

    expected_keys = {
        "transport",
        "httpSecurity",
        "threatIntel",
        "infrastructure",
        "bestPractices",
    }
    assert set(diff["breakdownDelta"]["base"]) == expected_keys
    assert set(diff["breakdownDelta"]["compare"]) == expected_keys
    assert set(diff["breakdownDelta"]["delta"]) == expected_keys


@pytest.mark.unit
def test_compute_scan_diff_handles_missing_breakdown_gracefully() -> None:
    """Both scans without any SUCCESS modules → null breakdown sides."""
    base = _scan(module_results=[])
    compare = _scan(module_results=[])

    diff = compute_scan_diff(base, compare)

    assert diff["breakdownDelta"]["base"] is None
    assert diff["breakdownDelta"]["compare"] is None
    assert diff["breakdownDelta"]["delta"] is None


@pytest.mark.unit
def test_compute_scan_diff_carries_scan_ids() -> None:
    base_id, compare_id = uuid4(), uuid4()
    base = _scan(scan_id=base_id, module_results=[])
    compare = _scan(scan_id=compare_id, module_results=[])

    diff = compute_scan_diff(base, compare)

    assert diff["baseScanId"] == str(base_id)
    assert diff["compareScanId"] == str(compare_id)


@pytest.mark.unit
def test_compute_scan_diff_respects_key_findings_limit() -> None:
    """The limit is forwarded to ``extract_key_findings``."""
    base = _scan(module_results=[])
    compare = _scan(module_results=[_ssl_module(days_remaining=-10)])

    # limit=0 ⇒ extract_key_findings still returns its rule-based set
    # because compute_severity_counts does not depend on it; the diff
    # added/removed list should still be derived from the limited findings.
    diff = compute_scan_diff(base, compare, key_findings_limit=0)
    # With a 0 limit, the helper truncates to zero findings, so we should
    # see no added entries despite the compare having an expired cert.
    assert diff["addedFindings"] == []


# ─── module-level constants ─────────────────────────────────────────────


@pytest.mark.unit
def test_constants_have_sane_defaults() -> None:
    assert DEFAULT_TIMELINE_LIMIT == 10
    assert MAX_TIMELINE_LIMIT >= DEFAULT_TIMELINE_LIMIT
    assert DIFF_KEY_FINDINGS_LIMIT == 8
    assert TIMELINE_RANGE_DAYS["all"] is None
    assert TIMELINE_RANGE_DAYS["7d"] == 7
    assert TIMELINE_RANGE_DAYS["30d"] == 30
    assert TIMELINE_RANGE_DAYS["90d"] == 90
