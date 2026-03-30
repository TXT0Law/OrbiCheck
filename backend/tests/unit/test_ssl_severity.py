"""Unit tests for SSL severity evaluation."""

from __future__ import annotations

import pytest

from app.services.monitor_service import SslThresholds, _evaluate_ssl_severity


@pytest.mark.unit
def test_evaluate_ssl_severity_ok_warn_critical_boundaries() -> None:
    th = SslThresholds(warn_days_remaining=30, critical_days_remaining=7)
    assert _evaluate_ssl_severity(90, False, th) == "ok"
    assert _evaluate_ssl_severity(28, False, th) == "warning"
    assert _evaluate_ssl_severity(5, False, th) == "critical"
    assert _evaluate_ssl_severity(30, False, th) == "warning"
    assert _evaluate_ssl_severity(7, False, th) == "critical"
    assert _evaluate_ssl_severity(-1, False, th) == "critical"
    assert _evaluate_ssl_severity(10, True, th) == "critical"
    assert _evaluate_ssl_severity(None, False, th) == "unknown"
