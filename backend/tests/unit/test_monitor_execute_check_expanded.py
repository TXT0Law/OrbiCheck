"""
Expanded execute_check tests (content + uptime + errors) with respx + AsyncMock DB.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import socket
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest
import respx

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import (
    CheckErrorType,
    Monitor,
    MonitorChange,
    MonitorCheck,
    MonitorSnapshot,
    MonitorStatus,
    MonitorVisualCapture,
)
from app.services import monitor_service
from app.services.content_change_helpers import compute_content_fingerprint
from app.services.monitor_service import execute_check
from app.services.ssl_probe import SslProbeResult


def _db_for_execute(
    mon: Monitor,
    *,
    prev_snapshot: MonitorSnapshot | None = None,
    rolling_rows: list | None = None,
) -> tuple[AsyncMock, list]:
    rolling_rows = rolling_rows or []
    added: list = []

    def add_side(o: object) -> None:
        added.append(o)

    async def flush_fn() -> None:
        for obj in added:
            if isinstance(obj, MonitorCheck) and obj.id is None:
                obj.id = uuid4()
            if isinstance(obj, MonitorSnapshot) and obj.id is None:
                obj.id = uuid4()
            if isinstance(obj, MonitorChange) and obj.id is None:
                obj.id = uuid4()

    async def execute_side_effect(stmt: object) -> MagicMock:
        st = str(stmt).lower()
        if "osint_monitor_snapshots" in st:
            r = MagicMock()
            r.scalar_one_or_none.return_value = prev_snapshot
            return r
        if "osint_monitor_changes" in st:
            r = MagicMock()
            if "count" in st:
                r.scalar.return_value = 0
            else:
                r.scalar_one_or_none.return_value = None
            return r
        r2 = MagicMock()
        r2.scalars.return_value.all.return_value = rolling_rows
        return r2

    db = AsyncMock()
    db.get = AsyncMock(
        side_effect=lambda model, pk: mon if model is Monitor and pk == mon.id else None
    )
    db.add = MagicMock(side_effect=add_side)
    db.flush = AsyncMock(side_effect=flush_fn)
    db.execute = AsyncMock(side_effect=execute_side_effect)
    return db, added


def _content_mon(
    mid,
    *,
    last_hash: str | None = None,
    min_change_bytes: int = 0,
    http_method: str = "GET",
    expected_code: int | None = None,
    max_rt_ms: float | None = 5000.0,
    content_thresholds: dict | None = None,
) -> Monitor:
    caps = capabilities_from_enabled_list(["uptime_only", "content_change"])
    caps["content_change"]["thresholds"]["minChangeSizeBytes"] = (
        None if min_change_bytes == 0 else min_change_bytes
    )
    if content_thresholds:
        caps["content_change"]["thresholds"].update(content_thresholds)
    caps["uptime_only"]["thresholds"]["maxResponseTimeMs"] = max_rt_ms
    return Monitor(
        id=mid,
        user_id=1,
        display_name="c",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["uptime_only", "content_change"],
        interval_seconds=300,
        http_method=http_method,
        expected_status_code=expected_code,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
        last_content_hash=last_hash,
        consecutive_failures=0,
        total_checks=0,
        total_changes_detected=0,
    )


def _uptime_mon(mid, **kwargs) -> Monitor:
    caps = capabilities_from_enabled_list(["uptime_only"])
    m = Monitor(
        id=mid,
        user_id=1,
        display_name="u",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["uptime_only"],
        interval_seconds=300,
        http_method=kwargs.get("http_method", "GET"),
        expected_status_code=kwargs.get("expected_status_code"),
        is_enabled=kwargs.get("is_enabled", True),
        status=kwargs.get("status", MonitorStatus.PENDING),
        tags=[],
        consecutive_failures=kwargs.get("consecutive_failures", 0),
        total_checks=kwargs.get("total_checks", 0),
    )
    return m


@pytest.fixture
def public_example_dns(monkeypatch):
    def _fake(host: str, *args, **kwargs):
        _ = args, kwargs
        if host == "example.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        raise OSError("unexpected host")

    monkeypatch.setattr(socket, "getaddrinfo", _fake)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_execute_check_disabled_returns_none(public_example_dns) -> None:
    mid = uuid4()
    m = _uptime_mon(mid, is_enabled=False)
    db, _ = _db_for_execute(m)
    assert await execute_check(mid, db, redis=None) is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_baseline_creates_snapshot(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    html = "<html><body>a</body></html>"
    mon = _content_mon(mid, last_hash=None)
    db, added = _db_for_execute(mon)
    redis = AsyncMock()
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(
            200,
            text=html,
            headers={"content-type": "text/html; charset=utf-8"},
        )
    )
    await execute_check(mid, db, redis=redis)
    snaps = [x for x in added if isinstance(x, MonitorSnapshot)]
    assert len(snaps) == 1
    assert snaps[0].is_baseline is True
    assert mon.last_content_hash == hashlib.sha256(html.encode("utf-8")).hexdigest()
    changes = [x for x in added if isinstance(x, MonitorChange)]
    assert len(changes) == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_change_with_head_method_fails_fast(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """HEAD has no body to hash; content_change must fail fast (Bug 3)."""
    mid = uuid4()
    html = "<p>x</p>"
    mon = _content_mon(mid, last_hash=None, http_method="HEAD")
    db, _ = _db_for_execute(mon)
    get_route = respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text=html)
    )
    head_route = respx_mock.head("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    check = await execute_check(mid, db, redis=None)
    assert check is not None
    assert check.success is False
    assert check.error_type == CheckErrorType.UNKNOWN
    assert "HEAD" in (check.error_message or "")
    assert not get_route.called
    assert not head_route.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_same_hash_no_new_snapshot(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    html = "<html>same</html>"
    h = hashlib.sha256(html.encode("utf-8")).hexdigest()
    mon = _content_mon(mid, last_hash=h)
    db, added = _db_for_execute(mon)
    respx_mock.get("https://example.com/").mock(return_value=httpx.Response(200, text=html))
    await execute_check(mid, db, redis=None)
    assert not any(isinstance(x, MonitorSnapshot) for x in added)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_change_publishes_event(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    v1 = "<html><body>one</body></html>"
    v2 = "<html><body>two</body></html>"
    h1 = hashlib.sha256(v1.encode("utf-8")).hexdigest()
    mon = _content_mon(mid, last_hash=h1, min_change_bytes=0)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h1,
        content_size_bytes=len(v1.encode("utf-8")),
        content=v1,
        is_baseline=True,
    )
    db, added = _db_for_execute(mon, prev_snapshot=prev)
    redis = AsyncMock()
    respx_mock.get("https://example.com/").mock(return_value=httpx.Response(200, text=v2))
    await execute_check(mid, db, redis=redis)
    changes = [x for x in added if isinstance(x, MonitorChange)]
    assert len(changes) == 1
    assert mon.total_changes_detected == 1
    pub = [c for c in redis.publish.call_args_list if c.args]
    payloads = [c.args[1] for c in pub if len(c.args) > 1]
    assert any("content_changed" in str(p) for p in payloads)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_below_threshold_no_change_row(
    respx_mock: respx.MockRouter,
    public_example_dns,
    monkeypatch,
) -> None:
    mid = uuid4()
    base = "hello world"
    tiny = base + "!"  # tiny byte delta, tiny diff
    h0 = hashlib.sha256(base.encode()).hexdigest()
    mon = _content_mon(mid, last_hash=h0, min_change_bytes=500)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h0,
        content_size_bytes=len(base.encode()),
        content=base,
        is_baseline=True,
    )
    db, added = _db_for_execute(mon, prev_snapshot=prev)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text=tiny)
    )
    await execute_check(mid, db, redis=None)
    assert not any(isinstance(x, MonitorChange) for x in added)
    assert mon.last_content_hash == hashlib.sha256(tiny.encode()).hexdigest()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_timeout_no_snapshot(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _content_mon(mid, last_hash="abc")
    db, added = _db_for_execute(mon)
    respx_mock.get("https://example.com/").mock(
        side_effect=httpx.TimeoutException("timeout")
    )
    await execute_check(mid, db, redis=None)
    assert not any(isinstance(x, MonitorSnapshot) for x in added)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_http_500_skips_snapshot(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _content_mon(mid, last_hash="abc")
    db, added = _db_for_execute(mon)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(500, text="err")
    )
    await execute_check(mid, db, redis=None)
    assert not any(isinstance(x, MonitorSnapshot) for x in added)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_missing_prev_snapshot_rebaseline(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _content_mon(mid, last_hash="deadbeef" * 8)  # mismatched vs body
    db, added = _db_for_execute(mon, prev_snapshot=None)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text="<p>new</p>")
    )
    await execute_check(mid, db, redis=None)
    snaps = [x for x in added if isinstance(x, MonitorSnapshot)]
    assert len(snaps) == 1
    assert snaps[0].is_baseline is True


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_body_too_large_marks_check_failed(
    respx_mock: respx.MockRouter,
    public_example_dns,
    monkeypatch,
) -> None:
    mid = uuid4()
    mon = _content_mon(mid, last_hash=None)
    db, added = _db_for_execute(mon)
    monkeypatch.setattr(
        monitor_service.settings,
        "MONITOR_MAX_BODY_BYTES",
        10,
    )
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text="x" * 50)
    )
    chk = await execute_check(mid, db, redis=None)
    assert chk is not None
    assert chk.success is False
    assert chk.error_type == CheckErrorType.CONTENT_TOO_LARGE


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_rejects_non_text_type(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _content_mon(mid, last_hash=None)
    db, _ = _db_for_execute(mon)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, headers={"content-type": "image/png"}, content=b"x")
    )
    chk = await execute_check(mid, db, redis=None)
    assert chk is not None
    assert chk.success is False
    assert chk.error_type == CheckErrorType.HTTP_ERROR


@pytest.mark.asyncio
@pytest.mark.unit
async def test_uptime_stream_success(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _uptime_mon(mid)
    db, _ = _db_for_execute(mon)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text="ok")
    )
    chk = await execute_check(mid, db, redis=None)
    assert chk is not None
    assert chk.success is True
    assert mon.consecutive_failures == 0


@pytest.mark.asyncio
@pytest.mark.unit
async def test_uptime_head_uses_head(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _uptime_mon(mid, http_method="HEAD")
    db, _ = _db_for_execute(mon)
    route = respx_mock.head("https://example.com/").mock(
        return_value=httpx.Response(200)
    )
    await execute_check(mid, db, redis=None)
    assert route.called


@pytest.mark.asyncio
@pytest.mark.unit
async def test_uptime_failure_increments_consecutive(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _uptime_mon(mid, consecutive_failures=1)
    db, _ = _db_for_execute(mon)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(500, text="e")
    )
    await execute_check(mid, db, redis=None)
    assert mon.consecutive_failures == 2
    assert mon.last_success is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_uptime_status_changed_event(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    mid = uuid4()
    mon = _uptime_mon(mid, status=MonitorStatus.UP, consecutive_failures=2)
    db, _ = _db_for_execute(mon)
    redis = AsyncMock()
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(500, text="e")
    )
    await execute_check(mid, db, redis=redis)
    joined = " ".join(str(c.args) for c in redis.publish.call_args_list)
    assert "status_changed" in joined


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_only_monitor_updates_ssl_fields(
    public_example_dns,
) -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    mon = Monitor(
        id=mid,
        user_id=1,
        display_name="s",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.PENDING,
        tags=[],
    )
    db, _ = _db_for_execute(mon)

    async def _probe(*_a, **_kw):
        return SslProbeResult(
            success=True,
            hostname="example.com",
            port=443,
            probe_time_ms=12.0,
            days_remaining=45,
            not_before="2025-01-01T00:00:00+00:00",
            not_after="2027-01-01T00:00:00+00:00",
            subject_dn="CN=example.com",
            issuer_dn="CN=ca",
            serial_number="ab",
            signature_algorithm="sha256WithRSAEncryption",
            sha256_fingerprint="AA:BB",
            is_valid=True,
            is_expired=False,
            subject_alternative_names=["example.com"],
            chain=[
                {
                    "subject_dn": "CN=example.com",
                    "issuer_dn": "CN=ca",
                    "not_before": "2025-01-01T00:00:00+00:00",
                    "not_after": "2027-01-01T00:00:00+00:00",
                    "serial_number": "ab",
                    "signature_algorithm": "sha256WithRSAEncryption",
                    "sha256_fingerprint": "AA:BB",
                    "position": 0,
                    "is_leaf": True,
                }
            ],
        )

    with patch.object(monitor_service, "probe_ssl_async", _probe):
        chk = await execute_check(mid, db, redis=None)
    assert chk is not None
    assert chk.ssl_days_remaining == 45
    assert mon.ssl_expiry_days == 45
    assert chk.ssl_snapshot is not None
    assert chk.ssl_snapshot.get("days_remaining") == 45


@pytest.mark.asyncio
@pytest.mark.unit
async def test_degraded_when_response_slow(
    public_example_dns,
) -> None:
    """Slow httpx response marks probe degraded when maxResponseTimeMs is low."""
    mid = uuid4()
    body = "<p>ok</p>"
    h = hashlib.sha256(body.encode("utf-8")).hexdigest()
    mon = _content_mon(mid, last_hash=h, max_rt_ms=1.0)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h,
        content_size_bytes=len(body.encode("utf-8")),
        content=body,
        is_baseline=True,
    )
    db, _ = _db_for_execute(mon, prev_snapshot=prev)

    async def delayed_request(self, method, url, **kwargs):
        await asyncio.sleep(0.05)
        return httpx.Response(
            200,
            text=body,
            headers={"content-type": "text/html"},
        )

    with patch.object(httpx.AsyncClient, "request", delayed_request):
        await execute_check(mid, db, redis=None)
    assert mon.status == MonitorStatus.DEGRADED


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_same_hash_uuid_only_difference_no_change(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """UUID-only edits normalize to the same fingerprint; no new change row."""
    mid = uuid4()
    a = "<html><body>550e8400-e29b-41d4-a716-446655440000</body></html>"
    b = "<html><body>660e8400-e29b-41d4-a716-446655440001</body></html>"
    h = compute_content_fingerprint(a, normalize=True)
    assert h == compute_content_fingerprint(b, normalize=True)
    mon = _content_mon(mid, last_hash=h)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h,
        content_size_bytes=len(a.encode("utf-8")),
        content=a,
        is_baseline=True,
    )
    db, added = _db_for_execute(mon, prev_snapshot=prev)
    respx_mock.get("https://example.com/").mock(return_value=httpx.Response(200, text=b))
    await execute_check(mid, db, redis=None)
    assert not any(isinstance(x, MonitorChange) for x in added)
    assert not any(isinstance(x, MonitorSnapshot) for x in added)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_degraded_page_suppresses_change(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """Captcha / bot-check style HTML does not create MonitorChange rows."""
    mid = uuid4()
    good = "<html><body>stable product</body></html>"
    captcha = (
        "<html><head><title>Attention Required</title></head>"
        "<body>Cloudflare cf-browser-verification</body></html>"
    )
    h_good = compute_content_fingerprint(good, normalize=True)
    mon = _content_mon(mid, last_hash=h_good)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h_good,
        content_size_bytes=len(good.encode("utf-8")),
        content=good,
        is_baseline=True,
    )
    db, added = _db_for_execute(mon, prev_snapshot=prev)
    respx_mock.get("https://example.com/").mock(
        return_value=httpx.Response(200, text=captcha)
    )
    await execute_check(mid, db, redis=None)
    assert not any(isinstance(x, MonitorChange) for x in added)
    assert not any(isinstance(x, MonitorSnapshot) for x in added)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_uuid_change_recorded_when_raw_hashing_enabled(
    respx_mock: respx.MockRouter,
    public_example_dns,
) -> None:
    """With normalizeVolatileTokens false, UUID-only edits still record a change."""
    mid = uuid4()
    a = "<html><body>550e8400-e29b-41d4-a716-446655440000</body></html>"
    b = "<html><body>660e8400-e29b-41d4-a716-446655440001</body></html>"
    h_a = compute_content_fingerprint(a, normalize=False)
    mon = _content_mon(
        mid,
        last_hash=h_a,
        content_thresholds={"normalizeVolatileTokens": False},
    )
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h_a,
        content_size_bytes=len(a.encode("utf-8")),
        content=a,
        is_baseline=True,
    )
    db, added = _db_for_execute(mon, prev_snapshot=prev)
    respx_mock.get("https://example.com/").mock(return_value=httpx.Response(200, text=b))
    await execute_check(mid, db, redis=None)
    assert any(isinstance(x, MonitorChange) for x in added)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_uptime_slow_response_dispatches_alert(
    public_example_dns,
    monkeypatch,
) -> None:
    mid = uuid4()
    body = "<p>ok</p>"
    h = hashlib.sha256(body.encode("utf-8")).hexdigest()
    mon = _content_mon(mid, last_hash=h, max_rt_ms=1.0)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h,
        content_size_bytes=len(body.encode("utf-8")),
        content=body,
        is_baseline=True,
    )
    db, _ = _db_for_execute(mon, prev_snapshot=prev)
    alert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(monitor_service.alert_service, "evaluate_and_dispatch_alert", alert_mock)

    async def delayed_request(self, method, url, **kwargs):
        await asyncio.sleep(0.05)
        return httpx.Response(
            200,
            text=body,
            headers={"content-type": "text/html"},
        )

    with patch.object(httpx.AsyncClient, "request", delayed_request):
        await execute_check(mid, db, redis=None)

    assert any(call.args[1] == "uptime_only" for call in alert_mock.await_args_list)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_content_change_dispatches_alert_service(
    respx_mock: respx.MockRouter,
    public_example_dns,
    monkeypatch,
) -> None:
    mid = uuid4()
    v1 = "<html><body>one</body></html>"
    v2 = "<html><body>two</body></html>"
    h1 = hashlib.sha256(v1.encode("utf-8")).hexdigest()
    mon = _content_mon(mid, last_hash=h1, min_change_bytes=0)
    prev = MonitorSnapshot(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        content_hash=h1,
        content_size_bytes=len(v1.encode("utf-8")),
        content=v1,
        is_baseline=True,
    )
    db, _ = _db_for_execute(mon, prev_snapshot=prev)
    alert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(monitor_service.alert_service, "evaluate_and_dispatch_alert", alert_mock)
    respx_mock.get("https://example.com/").mock(return_value=httpx.Response(200, text=v2))

    await execute_check(mid, db, redis=AsyncMock())

    assert any(call.args[1] == "content_change" for call in alert_mock.await_args_list)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ssl_warning_dispatches_alert_service(
    public_example_dns,
    monkeypatch,
) -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["ssl_expiry"])
    mon = Monitor(
        id=mid,
        user_id=1,
        display_name="s",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["ssl_expiry"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.PENDING,
        tags=[],
    )
    db, _ = _db_for_execute(mon)
    alert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(monitor_service.alert_service, "evaluate_and_dispatch_alert", alert_mock)

    async def _probe(*_a, **_kw):
        return SslProbeResult(
            success=True,
            hostname="example.com",
            port=443,
            probe_time_ms=12.0,
            days_remaining=5,
            not_before="2025-01-01T00:00:00+00:00",
            not_after="2027-01-01T00:00:00+00:00",
            subject_dn="CN=example.com",
            issuer_dn="CN=ca",
            serial_number="ab",
            signature_algorithm="sha256WithRSAEncryption",
            sha256_fingerprint="AA:BB",
            is_valid=True,
            is_expired=False,
            subject_alternative_names=["example.com"],
            chain=[],
        )

    monkeypatch.setattr(monitor_service, "probe_ssl_async", _probe)
    await execute_check(mid, db, redis=AsyncMock())

    assert any(call.args[1] == "ssl_expiry" for call in alert_mock.await_args_list)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_visual_change_dispatches_alert_service(monkeypatch) -> None:
    mid = uuid4()
    caps = capabilities_from_enabled_list(["visual_change"])
    mon = Monitor(
        id=mid,
        user_id=1,
        display_name="visual",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["visual_change"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )
    check = MonitorCheck(
        id=uuid4(),
        monitor_id=mid,
        success=True,
        response_time_ms=100.0,
        content_changed=False,
        evaluated_capabilities=["visual_change"],
    )
    prev_capture = MonitorVisualCapture(
        id=uuid4(),
        monitor_id=mid,
        check_id=uuid4(),
        image_png=b"prev",
        width_px=10,
        height_px=10,
        viewport_width=1280,
        viewport_height=720,
        full_page=False,
        perceptual_hash_hex="0000000000000000",
        dhash_algo="dhash",
    )
    added: list[object] = []

    def add_side_effect(obj: object) -> None:
        added.append(obj)

    async def flush_side_effect() -> None:
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()

    db = AsyncMock()
    db.add = MagicMock(side_effect=add_side_effect)
    db.flush = AsyncMock(side_effect=flush_side_effect)
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=prev_capture))
    )
    alert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(monitor_service.alert_service, "evaluate_and_dispatch_alert", alert_mock)
    monkeypatch.setattr(
        monitor_service,
        "call_screenshot_service",
        AsyncMock(
            return_value={
                "success": True,
                "image": base64.b64encode(
                    base64.b64decode(
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qS2kAAAAASUVORK5CYII="
                    )
                ).decode(),
            }
        ),
    )
    monkeypatch.setattr(
        monitor_service,
        "compute_dhash_hex",
        lambda _png: "ffffffffffffffff",
    )

    await monitor_service._run_visual_change_capture(mon, check, db, AsyncMock())

    assert any(call.args[1] == "visual_change" for call in alert_mock.await_args_list)
