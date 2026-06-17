"""B-9 / S-10 + S-11: per-module retry + degradedTarget SSE payload guard rails.

These tests exercise the failure-recovery branch in
``app.tasks.scan_tasks.execute_scan`` without spinning up Celery, the real
PostgreSQL session, or a live Redis. Each test stubs the sync DB session,
Redis, and the two scan_client helpers, then asserts:

* The right ``ScanModuleResult`` rows transition to ``RETRYING`` while the
  per-module retry is in flight (S-10 — DB enum).
* The retry uses ``call_scan_module_sync`` and the final status reflects
  per-module success / failure (not the wholesale FAILED of the legacy
  path).
* The Redis progress payload exposes ``currentModules`` and the
  ``degradedTarget`` flag once the failure threshold is crossed (S-11).
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterable
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.models.scan import ModuleStatus, ScanStatus
from app.tasks import scan_tasks


class _StubResult:
    """Mimic SQLAlchemy ``Result`` for the small number of code paths we hit."""

    def __init__(self, *, scalar: Any = None, rowcount: int = 1) -> None:
        self._scalar = scalar
        self.rowcount = rowcount

    def scalar_one(self) -> Any:
        return self._scalar

    def scalar_one_or_none(self) -> Any:
        return self._scalar


class _StubSession:
    """Synchronous DB session stub recording every ``execute`` call.

    The Celery task uses an SQLAlchemy ``Session`` exclusively through
    ``execute(...)`` + ``commit()``; we don't need a real engine for this
    unit test. We discriminate the various SELECT statements by inspecting
    the rendered SQL — ``select(Scan.status)`` produces a single
    ``scans.status`` column whereas ``select(Scan)`` selects every column.
    """

    def __init__(self, *, scan_status: ScanStatus, scan: Any) -> None:
        self._scan_status = scan_status
        self._scan = scan
        self.executed: list[Any] = []
        self.added: list[Any] = []
        self.commits: int = 0
        # The first status SELECT must report the pre-transition value
        # (PENDING) so execute_scan flips it to RUNNING. Every subsequent
        # status look-up is the cancellation guard and must report RUNNING.
        self._status_lookups = 0

    # --- Context manager protocol used by `with _get_sync_session() as db:`
    def __enter__(self) -> "_StubSession":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, statement: Any) -> _StubResult:
        self.executed.append(statement)
        sql = str(statement).lower()
        if sql.startswith("update "):
            return _StubResult(rowcount=1)
        if sql.startswith("select"):
            # ``select(Scan)`` hydrates the full row; ``select(Scan.status)``
            # only reads the enum.
            if " scans.url" in sql or " scans.id," in sql:
                return _StubResult(scalar=self._scan)
            if "scans.status" in sql:
                self._status_lookups += 1
                if self._status_lookups == 1:
                    return _StubResult(scalar=self._scan_status)
                return _StubResult(scalar=ScanStatus.RUNNING)
        return _StubResult(scalar=None)

    def _captured_update_values(self) -> list[dict[str, Any]]:
        """Extract the ``values()`` dict from each captured UPDATE statement."""
        out: list[dict[str, Any]] = []
        for stmt in self.executed:
            params = getattr(stmt, "_values", None) or {}
            if not params:
                # SQLAlchemy 2.x stores values under `_values` (a sentinel
                # dict) only when explicitly set; fall back to the compiled
                # form for older versions.
                try:
                    compiled = stmt.compile(compile_kwargs={"literal_binds": False})
                    params = dict(compiled.params)
                except Exception:
                    params = {}
            if isinstance(params, dict) and params:
                # Normalise SQLAlchemy ColumnClause keys to plain strings.
                out.append(
                    {str(k): v for k, v in params.items()}
                )
        return out

    def commit(self) -> None:
        self.commits += 1

    def add(self, obj: Any) -> None:
        self.added.append(obj)


class _StubRedis:
    """In-memory ``set`` / ``get`` so we can inspect the progress payload."""

    def __init__(self) -> None:
        self.storage: dict[str, str] = {}
        self.expires: dict[str, int] = {}

    def get(self, key: str) -> str | None:
        return self.storage.get(key)

    def set(self, key: str, value: str) -> None:
        self.storage[key] = value

    def expire(self, key: str, ttl: int) -> None:
        self.expires[key] = ttl

    def close(self) -> None:
        return None


@pytest.fixture
def stub_scan() -> Any:
    """Minimal scan record returned from ``select(Scan)``."""
    scan_id = uuid.uuid4()
    return MagicMock(
        id=scan_id,
        url="https://example.com",
        scan_options={},
        module_results=[],
        security_score=None,
    )


@pytest.fixture
def patched_environment(monkeypatch: pytest.MonkeyPatch, stub_scan):
    """Wire scan_tasks into the stub session + redis + scan_client helpers."""
    redis = _StubRedis()
    session = _StubSession(scan_status=ScanStatus.PENDING, scan=stub_scan)

    monkeypatch.setattr(scan_tasks, "get_redis_sync", lambda: redis)
    monkeypatch.setattr(scan_tasks, "_get_sync_session", lambda: session)
    monkeypatch.setattr(scan_tasks, "validate_url_safety", lambda _url: None)
    # Skip the security score recompute path — it touches selectinload eager
    # loaders that the stub session doesn't honour.
    monkeypatch.setattr(scan_tasks, "compute_security_score_v2", lambda *_a, **_kw: None)
    monkeypatch.setattr(
        scan_tasks,
        "resolve_security_score_for_detail",
        lambda **_kw: MagicMock(score=0),
    )
    return {"redis": redis, "session": session, "scan": stub_scan}


def _trim_modules(modules: Iterable[str], keep: set[str]) -> list[str]:
    return [m for m in modules if m in keep]


def _decode_progress_payloads(redis: _StubRedis) -> list[dict[str, Any]]:
    """Stub records the latest payload only; we want every Redis SET we
    captured during the test, but the real Redis behaviour is overwrite.
    For B-9 we test the *final* payload because that's the one the SSE
    consumer reads."""
    raw = redis.storage.get(next(iter(redis.storage.keys())))
    return [json.loads(raw)] if raw else []


@pytest.mark.unit
def test_batch_failure_marks_modules_retrying_then_resolves_per_module(
    monkeypatch: pytest.MonkeyPatch, patched_environment, stub_scan
) -> None:
    """S-10: when the batch HTTP call fails, modules become RETRYING and the
    per-module sync helper is invoked once per module to recover."""
    quick_modules = ["status", "headers", "dns"]
    monkeypatch.setattr(
        scan_tasks,
        "MODULE_BATCHES",
        {"quick": list(quick_modules), "medium": [], "heavy": []},
    )
    monkeypatch.setattr(scan_tasks, "ALL_MODULES", list(quick_modules))

    def _batch_explodes(*_a: object, **_kw: object) -> None:
        raise RuntimeError("scan-service batch endpoint 503")

    per_module_calls: list[str] = []

    def _per_module(name: str, _url: str, _opts: dict | None = None, **_kw: object) -> dict:
        per_module_calls.append(name)
        if name == "headers":
            return {
                "success": False,
                "statusCode": 200,
                "data": {"error": "upstream rate limited"},
                "durationMs": 12,
                "error": "upstream rate limited",
            }
        return {
            "success": True,
            "statusCode": 200,
            "data": {"ok": True, "module": name},
            "durationMs": 5,
        }

    monkeypatch.setattr(scan_tasks, "call_scan_batch_sync", _batch_explodes)
    monkeypatch.setattr(scan_tasks, "call_scan_module_sync", _per_module)

    # Celery's `bind=True` task auto-injects `self`; calling `.run(...)`
    # passes the Task instance as the first arg. We just provide scan_id.
    scan_tasks.execute_scan.request.id = "task-retry-1"
    result = scan_tasks.execute_scan.run(str(stub_scan.id))

    assert result["status"] in {
        ScanStatus.COMPLETED.value,
        ScanStatus.FAILED.value,
    }
    # Each batch-failed module should have been retried exactly once.
    assert sorted(per_module_calls) == sorted(quick_modules)

    # S-10: at least one UPDATE on ScanModuleResult must have flipped the
    # status to RETRYING before the per-module retry kicked off. SQLAlchemy
    # renders enum values inside BindParameter objects (param keys carry
    # the column name like 'scan_module_results.status'), so we walk every
    # captured value and inspect its `.value` attribute.
    captured_values = patched_environment["session"]._captured_update_values()

    def _has_retrying_status(params: dict[str, Any]) -> bool:
        for k, v in params.items():
            if not k.endswith(".status"):
                continue
            value = getattr(v, "value", v)
            if value == ModuleStatus.RETRYING:
                return True
        return False

    assert any(_has_retrying_status(v) for v in captured_values), (
        "S-10: expected at least one UPDATE setting status=RETRYING; "
        f"captured update params: {captured_values!r}"
    )


@pytest.mark.unit
def test_progress_payload_exposes_current_modules_and_degraded_target(
    monkeypatch: pytest.MonkeyPatch, patched_environment, stub_scan
) -> None:
    """S-11: SSE payload must carry currentModules during execution and flip
    degradedTarget=True once enough modules fail in the same batch."""
    quick_modules = ["status", "headers", "dns", "robots-txt"]
    monkeypatch.setattr(
        scan_tasks,
        "MODULE_BATCHES",
        {"quick": list(quick_modules), "medium": [], "heavy": []},
    )
    monkeypatch.setattr(scan_tasks, "ALL_MODULES", list(quick_modules))

    captured_payloads: list[dict[str, Any]] = []

    redis: _StubRedis = patched_environment["redis"]
    original_set = redis.set

    def _capturing_set(key: str, value: str) -> None:
        if key.endswith(":progress"):
            try:
                captured_payloads.append(json.loads(value))
            except (TypeError, ValueError):
                pass
        original_set(key, value)

    redis.set = _capturing_set  # type: ignore[assignment]

    # Fail all modules so target_failure_count >= SCAN_DEGRADED_TARGET_FAILURE_THRESHOLD.
    def _batch_all_fail(*_a: object, **_kw: object) -> dict:
        return {
            "results": {
                name: {
                    "success": False,
                    "statusCode": 200,
                    "data": {"error": "upstream 503"},
                    "durationMs": 1,
                }
                for name in quick_modules
            }
        }

    monkeypatch.setattr(scan_tasks, "call_scan_batch_sync", _batch_all_fail)
    monkeypatch.setattr(
        scan_tasks,
        "call_scan_module_sync",
        lambda *a, **kw: {  # never invoked — batch returned, just guard
            "success": False,
            "statusCode": 599,
            "data": {"error": "should not retry"},
            "durationMs": 0,
            "error": "should not retry",
        },
    )

    scan_tasks.execute_scan.request.id = "task-progress-1"
    scan_tasks.execute_scan.run(str(stub_scan.id))

    # The S-11 contract: at least one progress payload during execution
    # contains the in-flight module list and a True degradedTarget flag.
    has_current_modules = any(
        isinstance(p.get("currentModules"), list) for p in captured_payloads
    )
    assert has_current_modules, (
        "S-11: progress payload missing currentModules key — "
        f"saw payloads: {captured_payloads}"
    )
    assert any(p.get("degradedTarget") is True for p in captured_payloads), (
        "S-11: degradedTarget never set despite all modules failing — "
        f"saw payloads: {captured_payloads}"
    )
    # The terminal payload should always reset currentModules so the UI can
    # clear its "running:" chip list cleanly.
    final = captured_payloads[-1]
    assert final.get("currentModules") == [], (
        "S-11: final progress payload should reset currentModules to []; "
        f"saw {final.get('currentModules')!r}"
    )


@pytest.mark.unit
def test_module_status_retrying_enum_value_exposed() -> None:
    """B-9: defensive guard so future refactors don't silently rename the enum."""
    assert ModuleStatus.RETRYING.value == "retrying"
