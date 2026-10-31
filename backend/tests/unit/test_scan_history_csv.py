"""CSV export of owner-scoped scan history metadata."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.scan import ScanStatus
from app.services import scan_service


@pytest.mark.unit
@pytest.mark.asyncio
async def test_export_scan_history_csv_uses_owner_filters_and_escapes_formulas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_id = uuid4()
    created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    scan = SimpleNamespace(
        id=scan_id,
        domain="=HYPERLINK(\"https://example.com\")",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        created_at=created_at,
        completed_at=created_at,
        security_score=0,
    )
    captured: dict[str, object] = {}

    async def fake_list_scans(_db: object, **kwargs: object) -> tuple[list, int]:
        captured.update(kwargs)
        return [scan], 12

    monkeypatch.setattr(scan_service, "list_scans", fake_list_scans)
    body, total = await scan_service.export_scan_history_csv(
        object(),
        user_id=7,
        limit=5,
        offset=10,
        search="example",
        sort_by="domain_asc",
        status_group="completed",
    )

    assert total == 12
    assert captured == {
        "user_id": 7,
        "limit": 5,
        "offset": 10,
        "search": "example",
        "sort_by": "domain_asc",
        "status_group": "completed",
    }
    assert body.startswith("\ufeff")
    rows = list(csv.DictReader(io.StringIO(body.lstrip("\ufeff"))))
    assert len(rows) == 1
    assert rows[0]["id"] == str(scan_id)
    assert rows[0]["domain"].startswith("'=")
    assert rows[0]["securityScore"] == "0"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_export_scan_history_csv_has_header_when_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_list_scans(_db: object, **_kwargs: object) -> tuple[list, int]:
        return [], 0

    monkeypatch.setattr(scan_service, "list_scans", fake_list_scans)
    body, total = await scan_service.export_scan_history_csv(object(), user_id=1)

    assert total == 0
    assert list(csv.reader(io.StringIO(body.lstrip("\ufeff")))) == [
        list(scan_service.SCAN_EXPORT_COLUMNS)
    ]
