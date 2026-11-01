"""High-risk notification events are queued once per evidence-backed episode."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert, Update

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanModuleResult, ScanStatus
from app.models.scan_risk_notification_event import (
    RISK_EVENT_CANCELLED,
    RISK_EVENT_PENDING,
    RISK_EVENT_SENT,
    ScanRiskNotificationEvent,
)
from app.services import finding_notification_event
from app.services.finding_notification_event import RISK_EVENT_DISPATCH_MAX_BATCH_SIZE
from app.services.finding_identity import FINDING_RULESET_VERSION
from app.services.finding_transition import HighRiskTransition, RiskHistoryPage

COMPLETED_AT = datetime(2026, 11, 1, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"
NEXT_COMPLETION = COMPLETED_AT + timedelta(minutes=1)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pending_event_ids_are_bounded_stably_ordered_and_unlocked() -> None:
    event_ids = [uuid4(), uuid4()]

    class _Result:
        def scalars(self) -> _Result:
            return self

        def all(self) -> list[UUID]:
            return event_ids

    class _Session:
        def __init__(self) -> None:
            self.query: Any = None

        async def execute(self, query: Any) -> _Result:
            self.query = query
            return _Result()

    db = _Session()
    assert await finding_notification_event.list_pending_risk_event_ids(db) == event_ids
    query = db.query
    assert query is not None
    sql = str(query)
    assert "scan_risk_notification_events.status =" in sql
    assert "ORDER BY scan_risk_notification_events.created_at, scan_risk_notification_events.id" in sql
    assert "FOR UPDATE" not in sql
    assert finding_notification_event.RISK_EVENT_DISPATCH_BATCH_SIZE in query.compile().params.values()


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("limit", [0, RISK_EVENT_DISPATCH_MAX_BATCH_SIZE + 1])
async def test_pending_event_id_limit_rejects_unbounded_requests(limit: int) -> None:
    class _Session:
        async def execute(self, _query: Any) -> None:
            raise AssertionError("Invalid limit should not reach the database")

    with pytest.raises(ValueError, match="limit"):
        await finding_notification_event.list_pending_risk_event_ids(_Session(), limit)


def _evidence_scan(*, risk: bool, completed_at: datetime = COMPLETED_AT) -> Scan:
    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        completed_at=completed_at,
        finding_observations_projected_at=completed_at,
        finding_ruleset_version=FINDING_RULESET_VERSION,
    )
    scan.module_results = [
        ScanModuleResult(module_name="ssl", status=ModuleStatus.SUCCESS, raw_result={})
    ]
    scan.finding_observations = (
        [
            ScanFindingObservation(
                rule_id=RULE_ID,
                ruleset_version=FINDING_RULESET_VERSION,
                severity="high",
                title="SSL risk",
                description="Evidence-backed SSL risk",
                evidence_modules=["ssl"],
                observed_at=completed_at,
            )
        ]
        if risk
        else []
    )
    return scan


def _pending_event(scan: Scan, baseline: Scan) -> ScanRiskNotificationEvent:
    return ScanRiskNotificationEvent(
        id=uuid4(),
        scan_id=scan.id,
        scan_completed_at=scan.completed_at,
        baseline_scan_id=baseline.id,
        baseline_completed_at=baseline.completed_at,
        rule_id=RULE_ID,
        ruleset_version=FINDING_RULESET_VERSION,
        kind="new",
        status=RISK_EVENT_PENDING,
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_revalidation_locks_scan_before_event_and_keeps_live_candidate(monkeypatch) -> None:
    baseline = _evidence_scan(risk=False)
    scan = _evidence_scan(risk=True, completed_at=NEXT_COMPLETION)
    event = _pending_event(scan, baseline)
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(scalar_one_or_none=lambda: scan.id),
                SimpleNamespace(scalar_one_or_none=lambda: scan),
                SimpleNamespace(scalar_one_or_none=lambda: event),
            ]
        )
    )
    history = AsyncMock(return_value=RiskHistoryPage(scans=[baseline], complete=True))
    monkeypatch.setattr(finding_notification_event, "load_recent_risk_history", history)

    assert await finding_notification_event.revalidate_pending_risk_event_in_transaction(
        db, event.id
    )
    queries = [call.args[0] for call in db.execute.await_args_list]
    assert len(queries) == 3
    sql = [str(query.compile(dialect=postgresql.dialect())) for query in queries]
    assert "FOR UPDATE" not in sql[0]
    assert "FOR UPDATE OF scans" in sql[1]
    assert "FOR UPDATE OF scan_risk_notification_events" in sql[2]
    assert queries[1]._execution_options["populate_existing"]
    assert queries[2]._execution_options["populate_existing"]
    assert event.status == RISK_EVENT_PENDING
    history.assert_awaited_once_with(db, scan)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_revalidation_cancels_stale_pending_event_without_committing(monkeypatch) -> None:
    baseline = _evidence_scan(risk=False)
    scan = _evidence_scan(risk=True, completed_at=NEXT_COMPLETION)
    event = _pending_event(scan, baseline)
    scan.completed_at += timedelta(minutes=1)
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(scalar_one_or_none=lambda: scan.id),
                SimpleNamespace(scalar_one_or_none=lambda: scan),
                SimpleNamespace(scalar_one_or_none=lambda: event),
            ]
        ),
        commit=AsyncMock(),
    )
    monkeypatch.setattr(
        finding_notification_event,
        "load_recent_risk_history",
        AsyncMock(return_value=RiskHistoryPage(scans=[baseline], complete=True)),
    )

    assert not await finding_notification_event.revalidate_pending_risk_event_in_transaction(
        db, event.id
    )
    assert event.status == RISK_EVENT_CANCELLED
    db.commit.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_revalidation_does_not_cancel_event_requeued_for_another_scan(monkeypatch) -> None:
    baseline = _evidence_scan(risk=False)
    scan = _evidence_scan(risk=True, completed_at=NEXT_COMPLETION)
    event = _pending_event(scan, baseline)
    old_source_id = event.scan_id
    event.scan_id = uuid4()
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(scalar_one_or_none=lambda: old_source_id),
                SimpleNamespace(scalar_one_or_none=lambda: scan),
                SimpleNamespace(scalar_one_or_none=lambda: event),
            ]
        )
    )
    history = AsyncMock()
    monkeypatch.setattr(finding_notification_event, "load_recent_risk_history", history)

    assert not await finding_notification_event.revalidate_pending_risk_event_in_transaction(
        db, event.id
    )
    assert event.status == RISK_EVENT_PENDING
    history.assert_not_awaited()


@pytest.mark.unit
def test_dispatch_guard_requires_same_live_episode_and_successful_evidence() -> None:
    baseline = _evidence_scan(risk=False)
    current = _evidence_scan(risk=True, completed_at=NEXT_COMPLETION)
    event = ScanRiskNotificationEvent(
        scan_id=current.id,
        scan_completed_at=current.completed_at,
        baseline_scan_id=baseline.id,
        baseline_completed_at=baseline.completed_at,
        rule_id=RULE_ID,
        ruleset_version=FINDING_RULESET_VERSION,
        kind="new",
        status=RISK_EVENT_PENDING,
    )
    history = RiskHistoryPage(scans=[baseline], complete=True)

    assert finding_notification_event.risk_event_is_dispatchable(event, current, history)

    event.status = RISK_EVENT_SENT
    assert not finding_notification_event.risk_event_is_dispatchable(event, current, history)
    event.status = RISK_EVENT_PENDING
    event.kind = "regressed"
    assert not finding_notification_event.risk_event_is_dispatchable(event, current, history)
    event.kind = "new"

    current.completed_at = NEXT_COMPLETION + timedelta(minutes=1)
    assert not finding_notification_event.risk_event_is_dispatchable(event, current, history)


@pytest.mark.unit
def test_dispatch_guard_rejects_changed_baseline_or_missing_module_evidence() -> None:
    baseline = _evidence_scan(risk=False)
    current = _evidence_scan(risk=True, completed_at=NEXT_COMPLETION)
    event = ScanRiskNotificationEvent(
        scan_id=current.id,
        scan_completed_at=current.completed_at,
        baseline_scan_id=baseline.id,
        baseline_completed_at=baseline.completed_at,
        rule_id=RULE_ID,
        ruleset_version=FINDING_RULESET_VERSION,
        kind="new",
        status=RISK_EVENT_PENDING,
    )

    assert not finding_notification_event.risk_event_is_dispatchable(
        event, current, RiskHistoryPage(scans=[], complete=True)
    )
    baseline.completed_at = baseline.completed_at + timedelta(seconds=1)
    assert not finding_notification_event.risk_event_is_dispatchable(
        event, current, RiskHistoryPage(scans=[baseline], complete=True)
    )
    baseline.completed_at = COMPLETED_AT
    current.module_results[0].status = ModuleStatus.FAILED
    assert not finding_notification_event.risk_event_is_dispatchable(
        event, current, RiskHistoryPage(scans=[baseline], complete=True)
    )
    current.module_results[0].status = ModuleStatus.SUCCESS
    current.module_results[0].raw_result = {"skipped": True}
    assert not finding_notification_event.risk_event_is_dispatchable(
        event, current, RiskHistoryPage(scans=[baseline], complete=True)
    )
    current.module_results[0].raw_result = {}
    event.ruleset_version += 1
    assert not finding_notification_event.risk_event_is_dispatchable(
        event, current, RiskHistoryPage(scans=[baseline], complete=True)
    )


@pytest.mark.unit
def test_queue_uses_episode_conflict_key_and_does_not_commit(monkeypatch) -> None:
    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        completed_at=COMPLETED_AT,
    )
    transition = HighRiskTransition(
        scan_id=scan.id,
        rule_id=RULE_ID,
        kind="new",
        ruleset_version=FINDING_RULESET_VERSION,
        baseline_scan_id=uuid4(),
        baseline_completed_at=COMPLETED_AT,
    )
    monkeypatch.setattr(
        finding_notification_event,
        "load_recent_risk_history_sync",
        lambda *_args: RiskHistoryPage(scans=[], complete=True),
    )
    monkeypatch.setattr(
        finding_notification_event,
        "classify_high_risk_transitions",
        lambda *_args: [transition],
    )

    class _Session:
        def __init__(self) -> None:
            self.statements: list[object] = []

        def execute(self, statement):
            self.statements.append(statement)
            if len(self.statements) == 1:
                return SimpleNamespace(scalar_one=lambda: scan)
            return SimpleNamespace(rowcount=1)

    db = _Session()
    assert finding_notification_event.queue_high_risk_events_for_scan(db, scan.id) == 1
    assert len(db.statements) == 2
    statement = db.statements[1]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT ON CONSTRAINT uq_scan_risk_notification_episode DO UPDATE" in sql
    assert "scan_risk_notification_events.status =" in sql
    row = {
        getattr(key, "key", key): value
        for key, value in statement._multi_values[0][0].items()
    }
    assert row["scan_id"] == scan.id
    assert row["baseline_scan_id"] == transition.baseline_scan_id
    assert row["baseline_completed_at"] == transition.baseline_completed_at
    assert row["rule_id"] == RULE_ID


@pytest.mark.unit
def test_queue_skips_scans_without_safe_transitions(monkeypatch) -> None:
    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        completed_at=COMPLETED_AT,
    )
    monkeypatch.setattr(
        finding_notification_event,
        "load_recent_risk_history_sync",
        lambda *_args: RiskHistoryPage(scans=[], complete=True),
    )
    monkeypatch.setattr(finding_notification_event, "classify_high_risk_transitions", lambda *_args: [])

    class _Session:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, _statement):
            self.calls += 1
            if self.calls > 1:
                raise AssertionError("No notification event should be inserted")
            return SimpleNamespace(scalar_one=lambda: scan)

    db = _Session()
    assert finding_notification_event.queue_high_risk_events_for_scan(db, scan.id) == 0
    assert db.calls == 1


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_reconciliation_cancels_only_stale_pending_episode(monkeypatch) -> None:
    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        completed_at=COMPLETED_AT,
    )
    transition = HighRiskTransition(
        scan_id=scan.id,
        rule_id=RULE_ID,
        kind="regressed",
        ruleset_version=FINDING_RULESET_VERSION,
        baseline_scan_id=uuid4(),
        baseline_completed_at=COMPLETED_AT,
    )
    history = AsyncMock(return_value=RiskHistoryPage(scans=[], complete=True))
    monkeypatch.setattr(finding_notification_event, "load_recent_risk_history", history)
    monkeypatch.setattr(
        finding_notification_event,
        "classify_high_risk_transitions",
        lambda *_args: [transition],
    )

    class _Session:
        def __init__(self) -> None:
            self.statements: list[object] = []

        async def execute(self, statement):
            self.statements.append(statement)
            if len(self.statements) == 1:
                return SimpleNamespace(scalar_one=lambda: scan)
            return SimpleNamespace(rowcount=1)

    db = _Session()
    await finding_notification_event.reconcile_high_risk_events_after_retry(db, scan.id)

    assert len(db.statements) == 3
    history.assert_awaited_once_with(db, scan)
    stale = db.statements[1]
    assert isinstance(stale, Update)
    stale_sql = str(stale.compile(dialect=postgresql.dialect()))
    assert "scan_risk_notification_events.scan_completed_at !=" in stale_sql
    assert "NOT IN" in stale_sql
    assert "scan_risk_notification_events.status =" in stale_sql
    assert isinstance(db.statements[2], Insert)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_without_supported_transition_cancels_pending_without_insert(monkeypatch) -> None:
    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        completed_at=COMPLETED_AT,
    )
    monkeypatch.setattr(
        finding_notification_event,
        "load_recent_risk_history",
        AsyncMock(return_value=RiskHistoryPage(scans=[], complete=False)),
    )
    monkeypatch.setattr(finding_notification_event, "classify_high_risk_transitions", lambda *_args: [])

    class _Session:
        def __init__(self) -> None:
            self.statements: list[object] = []

        async def execute(self, statement):
            self.statements.append(statement)
            if len(self.statements) == 1:
                return SimpleNamespace(scalar_one=lambda: scan)
            return SimpleNamespace(rowcount=1)

    db = _Session()
    await finding_notification_event.reconcile_high_risk_events_after_retry(db, scan.id)

    assert len(db.statements) == 2
    stale = db.statements[1]
    assert isinstance(stale, Update)
    assert "NOT IN" not in str(stale.compile(dialect=postgresql.dialect()))
