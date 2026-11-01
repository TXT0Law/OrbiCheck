"""High-risk notification events are queued once per evidence-backed episode."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models.scan import Scan, ScanStatus
from app.services import finding_notification_event
from app.services.finding_identity import FINDING_RULESET_VERSION
from app.services.finding_transition import HighRiskTransition, RiskHistoryPage

COMPLETED_AT = datetime(2026, 11, 1, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"


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
