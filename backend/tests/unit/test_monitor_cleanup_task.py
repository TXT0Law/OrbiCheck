"""Unit tests for cleanup_monitor_snapshots Celery task.

Regression test for Bug 1 — calling the task in a fresh worker process used to
raise ``TypeError: expected an Engine or Connection, got NoneType`` because the
task referenced the module-level ``_dispatch_engine`` directly instead of going
through ``_get_dispatch_engine()``.
"""

from __future__ import annotations

import importlib
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

EXPECTED_RESULT_KEYS = frozenset(
    {
        "monitors_processed",
        "monitors_with_visual",
        "snapshots_deleted",
        "changes_deleted",
        "visual_captures_deleted",
        "visual_changes_deleted",
    }
)

MODULE_PATH = "app.tasks.monitor_tasks"


def _fresh_module():
    """Import (or re-import) ``app.tasks.monitor_tasks`` with a clean state.

    Using ``importlib.reload`` resets the module-level ``_dispatch_engine``
    sentinel back to ``None`` so we can exercise the regression path where
    cleanup is the *first* thing a fresh worker process runs.
    """
    if MODULE_PATH in sys.modules:
        return importlib.reload(sys.modules[MODULE_PATH])
    return importlib.import_module(MODULE_PATH)


class _FakeSession:
    """Minimal SQLAlchemy ``Session`` stand-in for the cleanup task."""

    def __init__(self) -> None:
        self.committed = False
        self.deletes: list[Any] = []

    def __enter__(self) -> "_FakeSession":
        return self

    def __exit__(self, *_exc: Any) -> None:
        return None

    def execute(self, statement: Any) -> Any:
        self.deletes.append(statement)
        result = MagicMock()
        result.all.return_value = []
        result.scalar_one_or_none.return_value = None
        return result

    def scalars(self, _statement: Any) -> Any:
        result = MagicMock()
        result.all.return_value = []
        return result

    def commit(self) -> None:
        self.committed = True


@contextmanager
def _patched_session(module: Any, fake: _FakeSession):
    """Patch ``Session`` in the task module to return our fake session."""
    with patch.object(module, "Session", return_value=fake) as session_cls:
        yield session_cls


@pytest.mark.unit
def test_cleanup_uses_dispatch_engine_lazily_on_fresh_process() -> None:
    """Regression: cleanup must call ``_get_dispatch_engine()``.

    Previously the task referenced the bare module-level ``_dispatch_engine``
    which was ``None`` until ``dispatch_monitor_checks`` had run at least once.
    On a Celery worker that processed cleanup first, this raised TypeError.
    """
    module = _fresh_module()
    fake_engine = MagicMock(name="engine")
    fake_session = _FakeSession()

    with patch.object(module, "_get_dispatch_engine", return_value=fake_engine) as get_engine:
        with _patched_session(module, fake_session) as session_cls:
            result = module.cleanup_monitor_snapshots()

    get_engine.assert_called_once()
    session_cls.assert_called_once_with(fake_engine)
    assert fake_session.committed is True
    assert isinstance(result, dict)
    assert frozenset(result.keys()) == EXPECTED_RESULT_KEYS
    for key in EXPECTED_RESULT_KEYS:
        assert isinstance(result[key], int)
        assert result[key] >= 0


@pytest.mark.unit
def test_cleanup_does_not_reference_bare_dispatch_engine() -> None:
    """Calling cleanup on a freshly reloaded module must not raise TypeError.

    With the old buggy code, ``_dispatch_engine`` is ``None`` and the task
    tried to construct ``Session(None)`` which raises ``TypeError``. With the
    fix, ``_get_dispatch_engine()`` is invoked and we never see the type error.
    """
    module = _fresh_module()
    assert module._dispatch_engine is None

    fake_engine = MagicMock(name="engine")
    fake_session = _FakeSession()

    with patch.object(module, "_get_dispatch_engine", return_value=fake_engine):
        with _patched_session(module, fake_session):
            try:
                module.cleanup_monitor_snapshots()
            except TypeError as exc:  # pragma: no cover — regression guard
                pytest.fail(
                    f"cleanup_monitor_snapshots raised TypeError on a fresh "
                    f"module (regression of Bug 1): {exc}"
                )


@pytest.mark.unit
def test_cleanup_returns_zero_counts_when_no_monitors() -> None:
    module = _fresh_module()
    fake_engine = MagicMock(name="engine")
    fake_session = _FakeSession()

    with patch.object(module, "_get_dispatch_engine", return_value=fake_engine):
        with _patched_session(module, fake_session):
            result = module.cleanup_monitor_snapshots()

    assert result["monitors_processed"] == 0
    assert result["monitors_with_visual"] == 0
    assert result["snapshots_deleted"] == 0
    assert result["changes_deleted"] == 0
    assert result["visual_captures_deleted"] == 0
    assert result["visual_changes_deleted"] == 0


@pytest.mark.unit
def test_cleanup_discovers_history_after_capability_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _fresh_module()
    monitor_id = uuid4()
    fake_session = _FakeSession()
    original_execute = fake_session.execute
    history_queries: list[str] = []
    old_timestamp = datetime.now(timezone.utc) - timedelta(
        days=max(
            module.settings.MONITOR_MAX_SNAPSHOT_AGE_DAYS,
            module.settings.MONITOR_MAX_VISUAL_CAPTURE_AGE_DAYS,
        ) + 1
    )
    snapshots = [
        SimpleNamespace(id=uuid4(), captured_at=old_timestamp, is_baseline=False)
        for _ in range(module.settings.MONITOR_MIN_RETAINED_SNAPSHOTS + 1)
    ]
    visual_captures = [
        SimpleNamespace(id=uuid4(), captured_at=old_timestamp, is_diagnostic=False)
        for _ in range(module.settings.MONITOR_MIN_RETAINED_VISUAL_CAPTURES + 1)
    ]

    def execute_with_history(statement: Any) -> Any:
        query = str(statement)
        if "EXISTS" in query:
            history_queries.append(query)
            result = MagicMock()
            result.all.return_value = [(monitor_id,)]
            return result
        return original_execute(statement)

    def scalars_with_history(statement: Any) -> Any:
        result = MagicMock()
        query = str(statement)
        if f"FROM {module.MonitorSnapshot.__tablename__}" in query:
            result.all.return_value = snapshots
        elif f"FROM {module.MonitorVisualCapture.__tablename__}" in query:
            result.all.return_value = visual_captures
        else:
            result.all.return_value = []
        return result

    monkeypatch.setattr(fake_session, "execute", execute_with_history)
    monkeypatch.setattr(fake_session, "scalars", scalars_with_history)
    with patch.object(module, "_get_dispatch_engine", return_value=MagicMock()):
        with _patched_session(module, fake_session):
            result = module.cleanup_monitor_snapshots()

    assert result["monitors_processed"] == 1
    assert result["monitors_with_visual"] == 1
    assert result["snapshots_deleted"] == 1
    assert result["visual_captures_deleted"] == 1
    assert len(history_queries) == 2
    assert "monitor_snapshots" in history_queries[0]
    assert "monitor_changes" in history_queries[0]
    assert "monitor_visual_captures" in history_queries[1]
    assert "monitor_visual_changes" in history_queries[1]
    assert all("enabled_capabilities" not in query for query in history_queries)
