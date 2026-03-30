"""Unit tests for build_module_jobs."""

import pytest
from datetime import datetime, timezone

from app.services.transformers import build_module_jobs


class _FakeStatus:
    def __init__(self, value: str):
        self.value = value


class _FakeModuleResult:
    def __init__(
        self,
        module_name: str,
        status: str,
        error_message=None,
        raw_result=None,
        duration_ms=None,
    ):
        self.module_name = module_name
        self.status = _FakeStatus(status)
        self.error_message = error_message
        self.raw_result = raw_result
        self.duration_ms = duration_ms


class _FakeScan:
    def __init__(self, started_at=None, completed_at=None):
        self.started_at = started_at
        self.completed_at = completed_at


@pytest.mark.unit
def test_success_module_maps_to_success():
    module_results = [
        _FakeModuleResult("ssl", "success", raw_result={"success": True}, duration_ms=275),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 1
    assert jobs[0]["module"] == "ssl"
    assert jobs[0]["status"] == "success"
    assert jobs[0]["durationMs"] == 275


@pytest.mark.unit
def test_failed_module_maps_to_failed():
    module_results = [
        _FakeModuleResult("dns", "failed", error_message="Connection refused", duration_ms=100),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 1
    assert jobs[0]["module"] == "dns"
    assert jobs[0]["status"] == "failed"
    assert jobs[0]["error"] == "Connection refused"
    assert jobs[0]["durationMs"] == 100


@pytest.mark.unit
def test_timeout_module_maps_to_timed_out():
    module_results = [
        _FakeModuleResult("ports", "timeout", error_message="timed out", duration_ms=30000),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 1
    assert jobs[0]["status"] == "timed-out"


@pytest.mark.unit
def test_skipped_detection_via_note():
    module_results = [
        _FakeModuleResult(
            "features",
            "success",
            raw_result={"data": {"note": "BuiltWith API key not configured"}},
            duration_ms=0,
        ),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 1
    assert jobs[0]["status"] == "skipped"


@pytest.mark.unit
def test_skipped_detection_via_skipped_flag():
    module_results = [
        _FakeModuleResult("archives", "success", raw_result={"skipped": True}, duration_ms=0),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 1
    assert jobs[0]["status"] == "skipped"


@pytest.mark.unit
def test_success_with_real_data_not_skipped():
    module_results = [
        _FakeModuleResult("ssl", "success", raw_result={"valid_from": "2024-01-01"}, duration_ms=100),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 1
    assert jobs[0]["status"] == "success"


@pytest.mark.unit
def test_duration_ms_preserved():
    module_results = [
        _FakeModuleResult("headers", "success", raw_result={}, duration_ms=1234),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert jobs[0]["durationMs"] == 1234


@pytest.mark.unit
def test_error_only_on_failed():
    module_results = [
        _FakeModuleResult("ssl", "success", raw_result={}, duration_ms=100),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert "error" not in jobs[0]


@pytest.mark.unit
def test_sorting_failed_first():
    module_results = [
        _FakeModuleResult("ssl", "success", raw_result={}, duration_ms=100),
        _FakeModuleResult("dns", "failed", error_message="err", duration_ms=50),
        _FakeModuleResult("ports", "timeout", error_message="timeout", duration_ms=30000),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert jobs[0]["status"] == "failed"
    assert jobs[1]["status"] == "timed-out"
    assert jobs[2]["status"] == "success"


@pytest.mark.unit
def test_total_duration_from_scan_timestamps():
    start = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    end = datetime(2024, 1, 1, 12, 0, 5, tzinfo=timezone.utc)
    scan = _FakeScan(started_at=start, completed_at=end)
    jobs, total = build_module_jobs([], scan)
    assert total == 5000


@pytest.mark.unit
def test_empty_module_results():
    scan = _FakeScan()
    jobs, total = build_module_jobs([], scan)
    assert jobs == []
    assert total == 0


@pytest.mark.unit
def test_pending_modules_excluded():
    module_results = [
        _FakeModuleResult("ssl", "pending", duration_ms=0),
    ]
    scan = _FakeScan()
    jobs, total = build_module_jobs(module_results, scan)
    assert len(jobs) == 0
