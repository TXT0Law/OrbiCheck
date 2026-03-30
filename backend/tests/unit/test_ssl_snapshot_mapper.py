"""Tests for snapshot → MonitorSslStatusResponse mapping."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.monitor_service import SslThresholds, _snapshot_to_ssl_response


@pytest.mark.unit
def test_snapshot_to_response_success() -> None:
    th = SslThresholds(30, 7)
    snap = {
        "success": True,
        "days_remaining": 88,
        "is_expired": False,
        "is_valid": True,
        "not_before": "2025-06-01T00:00:00+00:00",
        "not_after": "2026-06-01T00:00:00+00:00",
        "subject_dn": "CN=a",
        "issuer_dn": "CN=b",
        "serial_number": "1a",
        "signature_algorithm": "sha256",
        "sha256_fingerprint": "AA:BB",
        "subject_alternative_names": ["a", "b"],
        "chain": [
            {
                "subject_dn": "CN=a",
                "issuer_dn": "CN=b",
                "not_before": "2025-06-01T00:00:00+00:00",
                "not_after": "2026-06-01T00:00:00+00:00",
                "sha256_fingerprint": "AA:BB",
                "position": 0,
                "is_leaf": True,
            }
        ],
    }
    at = datetime.now(timezone.utc)
    r = _snapshot_to_ssl_response(snap, at, th)
    assert r.days_remaining == 88
    assert r.severity_level == "ok"
    assert r.chain_summary[0].subject_dn == "CN=a"
    assert len(r.subject_alternative_names) == 2


@pytest.mark.unit
def test_snapshot_to_response_failure_sets_error() -> None:
    th = SslThresholds(30, 7)
    snap = {"success": False, "error_message": "TLS failed"}
    r = _snapshot_to_ssl_response(snap, datetime.now(timezone.utc), th)
    assert r.error == "TLS failed"
    assert r.severity_level == "unknown"
