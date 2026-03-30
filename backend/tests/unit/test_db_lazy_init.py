"""Unit tests for lazy database engine initialization."""

from __future__ import annotations

import pytest

from app.db import session as db_session
from app.tasks import monitor_tasks, scan_tasks


def _reset_db_session_state() -> None:
    db_session._engine = None
    db_session._session_factory = None


@pytest.mark.unit
def test_get_engine_requires_database_url(monkeypatch) -> None:
    """The async engine is created lazily and fails only when first requested."""
    _reset_db_session_state()
    monkeypatch.setattr(db_session.settings, "DATABASE_URL", "")

    with pytest.raises(RuntimeError, match="DATABASE_URL is not configured"):
        db_session.get_engine()


@pytest.mark.unit
def test_get_async_session_factory_requires_database_url(monkeypatch) -> None:
    """Session factory creation should surface missing DB configuration cleanly."""
    _reset_db_session_state()
    monkeypatch.setattr(db_session.settings, "DATABASE_URL", "")

    with pytest.raises(RuntimeError, match="DATABASE_URL is not configured"):
        db_session.get_async_session_factory()


@pytest.mark.unit
def test_scan_task_sync_engine_requires_database_url(monkeypatch) -> None:
    """Celery scan worker should not build a sync engine at import time."""
    monkeypatch.setattr(scan_tasks.settings, "DATABASE_URL", "")
    monkeypatch.setattr(scan_tasks, "sync_engine", None)

    with pytest.raises(RuntimeError, match="DATABASE_URL is not configured"):
        scan_tasks._get_sync_engine()


@pytest.mark.unit
def test_monitor_dispatch_engine_requires_database_url(monkeypatch) -> None:
    """Monitor dispatch engine should also be initialized lazily."""
    monkeypatch.setattr(monitor_tasks.settings, "DATABASE_URL", "")
    monkeypatch.setattr(monitor_tasks, "_dispatch_engine", None)

    with pytest.raises(RuntimeError, match="DATABASE_URL is not configured"):
        monitor_tasks._get_dispatch_engine()
