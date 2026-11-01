"""High-risk notification events are queued once per evidence-backed episode."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert, Update

from app.models.scan import ModuleStatus, Scan, ScanFindingObservation, ScanModuleResult, ScanStatus
from app.models.scan_risk_notification_event import (
    RISK_EVENT_PENDING,
    RISK_EVENT_SENT,
    ScanRiskNotificationEvent,
)
from app.services import finding_notification_event
from app.services.finding_identity import FINDING_RULESET_VERSION
from app.services.finding_transition import HighRiskTransition, RiskHistoryPage

COMPLETED_AT = datetime(2026, 11, 1, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"
NEXT_COMPLETION = COMPLETED_AT + timedelta(minutes=1)


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
