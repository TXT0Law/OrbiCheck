from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.exceptions import ScanNotFoundError
from app.models.scan import ModuleStatus, ScanStatus
from app.services import scan_service
from app.services.transformers import ALL_MODULES


class _FakeDb:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flush = AsyncMock(return_value=None)
        self.delete = AsyncMock(return_value=None)

    def add(self, obj: object) -> None:
        self.added.append(obj)


class _ScalarOneResult:
    def __init__(self, value: object) -> None:
        self._value = value

    def scalar_one_or_none(self) -> object:
        return self._value


class _ScalarsResult:
    def __init__(self, items: list[object]) -> None:
        self._items = items

    def scalars(self) -> _ScalarsResult:
        return self

    def all(self) -> list[object]:
        return self._items

    def scalar_one(self) -> int:
        return int(self._items[0])


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_scan_creates_pending_scan_and_module_slots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDb()
    monkeypatch.setattr(scan_service, "validate_url_safety", lambda _url: None)

    scan = await scan_service.create_scan(db, "https://example.com", ["ssl", "headers"], 7)

    module_rows = [obj for obj in db.added if getattr(obj, "module_name", None)]
    assert scan.status == ScanStatus.PENDING
    assert scan.user_id == 7
    assert scan.total_modules == 2
    assert len(module_rows) == len(ALL_MODULES)
    assert sum(1 for row in module_rows if row.status == ModuleStatus.PENDING) == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_scan_uses_all_modules_when_none_selected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDb()
    monkeypatch.setattr(scan_service, "validate_url_safety", lambda _url: None)

    scan = await scan_service.create_scan(db, "https://example.com", None, 1)

    assert scan.total_modules == len(ALL_MODULES)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_scan_propagates_url_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDb()
    monkeypatch.setattr(
        scan_service,
        "validate_url_safety",
        lambda _url: (_ for _ in ()).throw(ValueError("invalid url")),
    )

    with pytest.raises(ValueError, match="invalid url"):
        await scan_service.create_scan(db, "notaurl", None, 1)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_scan_returns_scan_when_present() -> None:
    expected = SimpleNamespace(id=uuid4(), status=ScanStatus.COMPLETED)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ScalarOneResult(expected))

    result = await scan_service.get_scan(db, expected.id, 1)

    assert result is expected


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_scan_raises_when_missing() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ScalarOneResult(None))

    with pytest.raises(ScanNotFoundError):
        await scan_service.get_scan(db, uuid4(), 1)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_list_scans_returns_rows_and_total() -> None:
    row = SimpleNamespace(id=uuid4(), status=ScanStatus.PENDING)
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_ScalarsResult([3]), _ScalarsResult([row])])

    scans, total = await scan_service.list_scans(
        db,
        user_id=1,
        limit=5,
        offset=10,
        search="example",
        status_group="active",
    )

    assert total == 3
    assert scans == [row]
