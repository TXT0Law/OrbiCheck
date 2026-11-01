"""Queue evidence-backed high-risk episodes in the scan completion transaction."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.models.scan import Scan
from app.models.scan_risk_notification_event import (
    RISK_EVENT_CANCELLED,
    RISK_EVENT_PENDING,
    ScanRiskNotificationEvent,
)
from app.services.finding_transition import (
    classify_high_risk_transitions,
    load_recent_risk_history_sync,
)


def queue_high_risk_events_for_scan(db: Session, scan_id: uuid.UUID) -> int:
    """Queue one event per proven episode without committing the transaction.

    Rescanned source rows may reactivate a cancelled, unsent episode. An
    already pending or sent episode remains untouched, even when another scan
    sees the same risk after the same clean baseline.
    """
    scan = db.execute(
        select(Scan)
        .where(Scan.id == scan_id)
        .options(
            selectinload(Scan.module_results),
            selectinload(Scan.finding_observations),
        )
        .execution_options(populate_existing=True)
        .with_for_update(of=Scan)
    ).scalar_one()
    history = load_recent_risk_history_sync(db, scan)
    transitions = classify_high_risk_transitions(scan, history)
    if not transitions or scan.completed_at is None:
        return 0

    rows = [
        {
            "id": uuid.uuid4(),
            "scan_id": scan.id,
            "scan_completed_at": scan.completed_at,
            "baseline_scan_id": transition.baseline_scan_id,
            "baseline_completed_at": transition.baseline_completed_at,
            "rule_id": transition.rule_id,
            "ruleset_version": transition.ruleset_version,
            "kind": transition.kind,
            "status": RISK_EVENT_PENDING,
        }
        for transition in transitions
    ]
    statement = insert(ScanRiskNotificationEvent).values(rows)
    statement = statement.on_conflict_do_update(
        constraint="uq_scan_risk_notification_episode",
        set_={
            "scan_id": statement.excluded.scan_id,
            "scan_completed_at": statement.excluded.scan_completed_at,
            "kind": statement.excluded.kind,
            "status": RISK_EVENT_PENDING,
            "sent_at": None,
        },
        where=ScanRiskNotificationEvent.status == RISK_EVENT_CANCELLED,
    )
    return db.execute(statement).rowcount
