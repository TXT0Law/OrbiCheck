"""Integration tests for the Phase 5 timeline + diff endpoints (T5.1 / T5.2).

The endpoints back the dashboard Trend page and the scan-to-scan Diff page.
Coverage:

* ``GET /scans/by-domain/{domain}/timeline``
  - returns owner-scoped points sorted oldest → newest
  - rejects ``range`` values outside the documented preset list
  - rejects ``limit`` values above the hard cap

* ``GET /scans/diff``
  - returns added / removed / severityDelta / breakdownDelta for valid IDs
  - propagates 404 from ``scan_service.get_scan`` (non-owner / unknown)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service, scan_trend


def _ssl_module(days_remaining: int) -> SimpleNamespace:
    valid_to = datetime.now(timezone.utc) + timedelta(days=days_remaining)
    return SimpleNamespace(
        module_name="ssl",
        status=ModuleStatus.SUCCESS,
        raw_result={
            "subject": "CN=example.com",
            "issuer": "CN=Test CA",
            "valid_to": valid_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "bits": 2048,
        },
        error_message=None,
        duration_ms=150,
        completed_at=datetime.now(timezone.utc),
    )


def _make_scan(
    *,
    scan_id: UUID,
    completed_at: datetime,
    security_score: int | None = 78,
    module_results: list[SimpleNamespace] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=scan_id,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        security_score=security_score,
        progress=100,
        total_modules=3,
        completed_modules=3,
        error_message=None,
        started_at=completed_at,
        completed_at=completed_at,
        created_at=completed_at,
        scan_options=None,
        celery_task_id=None,
        module_results=module_results or [_ssl_module(days_remaining=200)],
    )


# ─── Timeline ───────────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
async def test_timeline_returns_oldest_to_newest_for_owner(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_kwargs: dict = {}

    async def _fake_timeline(
        _db,
        *,
        user_id: int,
        domain: str,
        time_range: str,
        limit: int,
    ):
        captured_kwargs.update(
            {
                "user_id": user_id,
                "domain": domain,
                "time_range": time_range,
                "limit": limit,
            }
        )
        return [
            {
                "scanId": "00000000-0000-0000-0000-000000000001",
                "completedAt": "2026-04-01T00:00:00+00:00",
                "securityScore": 70,
                "severity": {"critical": 0, "high": 1, "medium": 2, "low": 3},
            },
            {
                "scanId": "00000000-0000-0000-0000-000000000002",
                "completedAt": "2026-05-01T00:00:00+00:00",
                "securityScore": 82,
                "severity": {"critical": 0, "high": 0, "medium": 1, "low": 4},
            },
        ]

    monkeypatch.setattr(scan_trend, "get_domain_timeline", _fake_timeline)

    response = await async_client.get(
        "/api/v1/scans/by-domain/example.com/timeline?range=30d&limit=5"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    data = body["data"]
    assert data["domain"] == "example.com"
    assert len(data["points"]) == 2
    assert data["points"][0]["securityScore"] == 70
    assert data["points"][1]["securityScore"] == 82
    assert body["meta"]["range"] == "30d"
    assert body["meta"]["limit"] == 5
    assert body["meta"]["count"] == 2

    assert captured_kwargs == {
        "user_id": 1,
        "domain": "example.com",
        "time_range": "30d",
        "limit": 5,
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_timeline_rejects_unknown_range_value(async_client) -> None:
    response = await async_client.get(
        "/api/v1/scans/by-domain/example.com/timeline?range=year"
    )
    assert response.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_timeline_rejects_oversized_limit(async_client) -> None:
    response = await async_client.get(
        "/api/v1/scans/by-domain/example.com/timeline?limit=10000"
    )
    assert response.status_code == 422


# ─── Diff ───────────────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
async def test_diff_returns_payload_when_both_scans_belong_to_owner(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_id, compare_id = uuid4(), uuid4()
    base = _make_scan(
        scan_id=base_id,
        completed_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        security_score=70,
        module_results=[_ssl_module(days_remaining=200)],
    )
    compare = _make_scan(
        scan_id=compare_id,
        completed_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        security_score=82,
        module_results=[_ssl_module(days_remaining=-10)],
    )
    by_id = {base_id: base, compare_id: compare}

    async def _get_scan(_db, _scan_id, user_id=None):
        assert user_id == 1
        scan = by_id.get(_scan_id)
        if scan is None:
            raise ScanNotFoundError(str(_scan_id))
        return scan

    monkeypatch.setattr(scan_service, "get_scan", _get_scan)

    response = await async_client.get(
        f"/api/v1/scans/diff?baseId={base_id}&compareId={compare_id}"
    )
    assert response.status_code == 200
    body = response.json()
    data = body["data"]
    assert data["baseScanId"] == str(base_id)
    assert data["compareScanId"] == str(compare_id)
    assert data["baseDomain"] == "example.com"
    assert data["compareDomain"] == "example.com"
    assert data["baseScore"] == 70
    assert data["compareScore"] == 82
    titles_added = {item["title"] for item in data["addedFindings"]}
    assert "SSL certificate expired" in titles_added
    assert data["severityDelta"]["delta"]["critical"] >= 1
    # camelCase keys in breakdown delta (mirrors shared/types/scan.ts).
    assert set(data["breakdownDelta"]["base"]) == {
        "transport",
        "httpSecurity",
        "threatIntel",
        "infrastructure",
        "bestPractices",
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_diff_404_when_one_scan_missing(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_id, compare_id = uuid4(), uuid4()

    async def _get_scan(_db, _scan_id, user_id=None):
        if _scan_id == base_id:
            return _make_scan(
                scan_id=base_id,
                completed_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            )
        raise ScanNotFoundError(str(_scan_id))

    monkeypatch.setattr(scan_service, "get_scan", _get_scan)

    response = await async_client.get(
        f"/api/v1/scans/diff?baseId={base_id}&compareId={compare_id}"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCAN_NOT_FOUND"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_diff_rejects_invalid_uuid_query_params(async_client) -> None:
    response = await async_client.get(
        "/api/v1/scans/diff?baseId=not-a-uuid&compareId=also-not"
    )
    assert response.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_diff_route_does_not_collide_with_scan_id_route(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``/scans/diff`` must hit the diff handler, not be eaten by ``/scans/{scan_id}``."""

    async def _get_scan(_db, _scan_id, user_id=None):
        # Only invoked by the diff handler, not by `/scans/{scan_id}` (which
        # would be unreachable if route ordering is wrong).
        return _make_scan(
            scan_id=_scan_id,
            completed_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        )

    monkeypatch.setattr(scan_service, "get_scan", _get_scan)

    response = await async_client.get(
        f"/api/v1/scans/diff?baseId={uuid4()}&compareId={uuid4()}"
    )
    # 200 = diff handler reached. If route order were wrong we'd get 422.
    assert response.status_code == 200
