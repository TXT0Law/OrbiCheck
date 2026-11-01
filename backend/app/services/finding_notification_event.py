"""Queue evidence-backed high-risk episodes in the scan completion transaction."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, or_, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.dialects.postgresql.dml import Insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from app.models.scan import Scan
from app.models.scan_risk_notification_event import (
    RISK_EVENT_CANCELLED,
    RISK_EVENT_PENDING,
    ScanRiskNotificationEvent,
)
from app.services.finding_transition import (
    HighRiskTransition,
    RiskHistoryPage,
    classify_high_risk_transitions,
    load_recent_risk_history,
    load_recent_risk_history_sync,
)

RISK_EVENT_DISPATCH_BATCH_SIZE = 50
RISK_EVENT_DISPATCH_MAX_BATCH_SIZE = 100


async def list_pending_risk_event_ids(
    db: AsyncSession, limit: int = RISK_EVENT_DISPATCH_BATCH_SIZE
) -> list[uuid.UUID]:
    """Read a bounded, stable candidate page without holding row locks.

    A later worker must lock the source scan before the event and revalidate
    its evidence. This ID list is never authority to send a notification.
    """
    if not 1 <= limit <= RISK_EVENT_DISPATCH_MAX_BATCH_SIZE:
        raise ValueError("Risk event dispatch limit is outside the allowed range")
    query = (
        select(ScanRiskNotificationEvent.id)
        .where(ScanRiskNotificationEvent.status == RISK_EVENT_PENDING)
        .order_by(
            ScanRiskNotificationEvent.created_at,
            ScanRiskNotificationEvent.id,
        )
        .limit(limit)
    )
    return list((await db.execute(query)).scalars().all())


def risk_event_is_dispatchable(
    event: ScanRiskNotificationEvent, scan: Scan, history: RiskHistoryPage
) -> bool:
    """Revalidate a queued episode against current, evidence-backed history.

    A caller must load fresh scan observations, module results, and bounded
    history before any external delivery. Rescans, retries, baseline changes,
    and missing evidence all fail closed instead of sending a stale alert.
    """
    if (
        event.status != RISK_EVENT_PENDING
        or event.scan_id != scan.id
        or event.scan_completed_at != scan.completed_at
        or event.ruleset_version != scan.finding_ruleset_version
    ):
        return False
    event_key = (
        event.baseline_scan_id,
        event.baseline_completed_at,
        event.rule_id,
        event.ruleset_version,
    )
    return any(
        transition.scan_id == event.scan_id
        and transition.kind == event.kind
        and transition.dedup_key == event_key
        for transition in classify_high_risk_transitions(scan, history)
    )


def _scan_query(scan_id: uuid.UUID) -> Select[tuple[Scan]]:
    return (
        select(Scan)
        .where(Scan.id == scan_id)
        .options(
            selectinload(Scan.module_results),
            selectinload(Scan.finding_observations),
        )
        .execution_options(populate_existing=True)
        .with_for_update(of=Scan)
    )


def _event_insert(scan: Scan, transitions: list[HighRiskTransition]) -> Insert:
    if scan.completed_at is None:
        raise ValueError("Risk event source scan has no completion time")
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
    return statement.on_conflict_do_update(
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


def queue_high_risk_events_for_scan(db: Session, scan_id: uuid.UUID) -> int:
    """Queue one event per proven episode without committing the transaction.

    Rescanned source rows may reactivate a cancelled, unsent episode. An
    already pending or sent episode remains untouched, even when another scan
    sees the same risk after the same clean baseline.
    """
    scan = db.execute(_scan_query(scan_id)).scalar_one()
    history = load_recent_risk_history_sync(db, scan)
    transitions = classify_high_risk_transitions(scan, history)
    if not transitions or scan.completed_at is None:
        return 0

    return db.execute(_event_insert(scan, transitions)).rowcount


async def reconcile_high_risk_events_after_retry(
    db: AsyncSession, scan_id: uuid.UUID
) -> None:
    """Replace stale pending candidates after module evidence changes.

    The finding projection and this reconciliation must share a transaction.
    Failed or missing evidence never becomes a proof of repair; it only stops
    an unsupported, unsent notification from being delivered.
    """
    scan = (await db.execute(_scan_query(scan_id))).scalar_one()
    history = await load_recent_risk_history(db, scan)
    transitions = classify_high_risk_transitions(scan, history)
    stale = update(ScanRiskNotificationEvent).where(
        ScanRiskNotificationEvent.scan_id == scan_id,
        ScanRiskNotificationEvent.status == RISK_EVENT_PENDING,
    )
    if transitions and scan.completed_at is not None:
        episode_columns = tuple_(
            ScanRiskNotificationEvent.baseline_scan_id,
            ScanRiskNotificationEvent.baseline_completed_at,
            ScanRiskNotificationEvent.rule_id,
            ScanRiskNotificationEvent.ruleset_version,
        )
        stale = stale.where(
            or_(
                ScanRiskNotificationEvent.scan_completed_at != scan.completed_at,
                episode_columns.not_in([transition.dedup_key for transition in transitions]),
            )
        )
    await db.execute(stale.values(status=RISK_EVENT_CANCELLED))
    if transitions:
        await db.execute(_event_insert(scan, transitions))
