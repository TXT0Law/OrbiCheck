"""Unit tests for Phase 2.1 latency percentile helpers."""

from __future__ import annotations

import pytest

from app.services.monitor_service import (
    _compute_latency_percentiles,
    _percentile,
)


@pytest.mark.unit
def test_percentile_empty_returns_zero() -> None:
    assert _percentile([], 0.5) == 0.0
    assert _percentile([], 0.99) == 0.0


@pytest.mark.unit
def test_percentile_single_sample() -> None:
    assert _percentile([42.0], 0.5) == 42.0
    assert _percentile([42.0], 0.99) == 42.0


@pytest.mark.unit
def test_percentile_nearest_rank_known_distribution() -> None:
    samples = [float(x) for x in range(1, 101)]  # 1..100
    assert _percentile(samples, 0.5) == 50.0
    assert _percentile(samples, 0.95) == 95.0
    assert _percentile(samples, 0.99) == 99.0


@pytest.mark.unit
def test_compute_latency_percentiles_empty() -> None:
    assert _compute_latency_percentiles([]) == (None, None, None)


@pytest.mark.unit
def test_compute_latency_percentiles_single() -> None:
    p50, p95, p99 = _compute_latency_percentiles([15.0])
    assert (p50, p95, p99) == (15.0, 15.0, 15.0)


@pytest.mark.unit
def test_compute_latency_percentiles_distribution_ordering() -> None:
    samples = [float(x) for x in range(1, 101)]
    p50, p95, p99 = _compute_latency_percentiles(samples)
    assert p50 is not None and p95 is not None and p99 is not None
    # Inclusive method on 1..100 yields 50.5 / 95.05 / 99.01-ish; assert ordering
    # plus reasonable bounds rather than exact floats to avoid brittleness across
    # CPython statistics implementations.
    assert p50 < p95 < p99
    assert 49.0 <= p50 <= 51.0
    assert 94.0 <= p95 <= 96.0
    assert 98.0 <= p99 <= 100.0


@pytest.mark.unit
def test_compute_latency_percentiles_unsorted_input() -> None:
    samples = [100.0, 1.0, 50.0, 25.0, 75.0]
    p50, _p95, _p99 = _compute_latency_percentiles(samples)
    assert p50 is not None
    assert 25.0 <= p50 <= 75.0
