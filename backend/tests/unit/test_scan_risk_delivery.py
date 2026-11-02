"""Single-event scan-risk delivery keeps database and network phases separate."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from redis.exceptions import RedisError

from app.services.finding_notification_event import ClaimedRiskSendSnapshot
from app.services.finding_notification_payload import ScanRiskNotificationPayload
from app.services.notification_channels.scan_risk_webhook import ScanRiskWebhookOutcome
from app.tasks import notification_tasks

COMPLETED_AT = datetime(2026, 11, 2, tzinfo=timezone.utc)
RULESET_VERSION = 1


class _SessionTracker:
    def __init__(self) -> None:
        self.open_sessions = 0
        self.open_transactions = 0

    def __call__(self) -> _SessionTracker:
        return self

    async def __aenter__(self) -> _SessionTracker:
        self.open_sessions += 1
        return self

    async def __aexit__(self, *_args: object) -> None:
        self.open_sessions -= 1

    def begin(self) -> _Transaction:
        return _Transaction(self)


class _Transaction:
    def __init__(self, tracker: _SessionTracker) -> None:
        self.tracker = tracker

    async def __aenter__(self) -> None:
        self.tracker.open_transactions += 1

    async def __aexit__(self, *_args: object) -> None:
        self.tracker.open_transactions -= 1


def _snapshot(event_id: UUID) -> ClaimedRiskSendSnapshot:
    scan_id = uuid4()
    return ClaimedRiskSendSnapshot(
        user_id=7,
        payload=ScanRiskNotificationPayload(
            event_id=event_id,
            scan_id=scan_id,
            domain="example.com",
            rule_id="ssl.certificate_expiry",
            ruleset_version=RULESET_VERSION,
            change_kind="new",
            severity="high",
            scan_completed_at=COMPLETED_AT,
            dashboard_path=f"/dashboard/scan/{scan_id}",
        ),
    )


def _patch_preflight(
    monkeypatch: pytest.MonkeyPatch,
    tracker: _SessionTracker,
    *,
    settings: dict[str, Any] | None = None,
) -> tuple[SimpleNamespace, AsyncMock]:
    redis = SimpleNamespace(aclose=AsyncMock())
    get_settings = AsyncMock(return_value=settings or {"scanRiskEventsEnabled": True})
    monkeypatch.setattr(notification_tasks, "async_session_factory", tracker)
    monkeypatch.setattr(
        notification_tasks,
        "Redis",
        SimpleNamespace(from_url=lambda *_args, **_kwargs: redis),
    )
    monkeypatch.setattr(notification_tasks, "get_notification_settings", get_settings)
    return redis, get_settings


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("webhook_result", "expected"),
    [
        (ScanRiskWebhookOutcome.CONFIRMED, "sent"),
        (ScanRiskWebhookOutcome.UNKNOWN, "unknown"),
        (ScanRiskWebhookOutcome.DISABLED, "cancelled"),
        (ScanRiskWebhookOutcome.BLOCKED, "cancelled"),
    ],
)
async def test_single_risk_delivery_records_only_confirmed_send_without_network_db_locks(
    monkeypatch: pytest.MonkeyPatch, webhook_result: ScanRiskWebhookOutcome, expected: str
) -> None:
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    redis, get_settings = _patch_preflight(monkeypatch, tracker)
    claim = AsyncMock(return_value=token)
    snapshot = AsyncMock(return_value=_snapshot(event_id))
    cancel = AsyncMock(return_value=True)
    mark_sent = AsyncMock(return_value=True)

    async def send(*_args: object) -> ScanRiskWebhookOutcome:
        assert tracker.open_sessions == 0
        assert tracker.open_transactions == 0
        return webhook_result

    monkeypatch.setattr(notification_tasks, "claim_pending_risk_event_in_transaction", claim)
    monkeypatch.setattr(notification_tasks, "load_claimed_risk_send_snapshot", snapshot)
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(notification_tasks, "mark_claimed_risk_event_sent_in_transaction", mark_sent)
    monkeypatch.setattr(notification_tasks, "send_scan_risk_webhook", send)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome.value == expected
    claim.assert_awaited_once()
    snapshot.assert_awaited_once()
    get_settings.assert_awaited_once_with(redis, 7)
    redis.aclose.assert_awaited_once()
    assert tracker.open_sessions == tracker.open_transactions == 0
    if webhook_result is ScanRiskWebhookOutcome.CONFIRMED:
        mark_sent.assert_awaited_once()
        cancel.assert_not_awaited()
    elif webhook_result is ScanRiskWebhookOutcome.UNKNOWN:
        mark_sent.assert_not_awaited()
        cancel.assert_not_awaited()
    else:
        cancel.assert_awaited_once()
        mark_sent.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_single_risk_delivery_leaves_claim_unresolved_when_settings_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    redis, get_settings = _patch_preflight(monkeypatch, tracker)
    get_settings.side_effect = RedisError("unavailable")
    cancel = AsyncMock()
    mark_sent = AsyncMock()
    send = AsyncMock()
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(
        notification_tasks,
        "load_claimed_risk_send_snapshot",
        AsyncMock(return_value=_snapshot(event_id)),
    )
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(notification_tasks, "mark_claimed_risk_event_sent_in_transaction", mark_sent)
    monkeypatch.setattr(notification_tasks, "send_scan_risk_webhook", send)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.PREFLIGHT_UNAVAILABLE
    redis.aclose.assert_awaited_once()
    send.assert_not_awaited()
    cancel.assert_not_awaited()
    mark_sent.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_single_risk_delivery_does_not_send_without_live_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracker = _SessionTracker()
    _patch_preflight(monkeypatch, tracker)
    snapshot = AsyncMock()
    send = AsyncMock()
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(notification_tasks, "load_claimed_risk_send_snapshot", snapshot)
    monkeypatch.setattr(notification_tasks, "send_scan_risk_webhook", send)

    outcome = await notification_tasks.deliver_one_scan_risk_event(uuid4())

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.NOT_CLAIMED
    snapshot.assert_not_awaited()
    send.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("cancel_recorded", [True, False])
async def test_single_risk_delivery_cancels_claim_when_evidence_disappears(
    monkeypatch: pytest.MonkeyPatch, cancel_recorded: bool
) -> None:
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(monkeypatch, tracker)
    cancel = AsyncMock(return_value=cancel_recorded)
    send = AsyncMock()
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(
        notification_tasks, "load_claimed_risk_send_snapshot", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(notification_tasks, "send_scan_risk_webhook", send)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    expected = (
        notification_tasks.ScanRiskDeliveryOutcome.CANCELLED
        if cancel_recorded
        else notification_tasks.ScanRiskDeliveryOutcome.STALE
    )
    assert outcome is expected
    cancel.assert_awaited_once()
    send.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_single_risk_delivery_does_not_claim_sent_when_confirmation_races(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(monkeypatch, tracker)
    mark_sent = AsyncMock(return_value=False)
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(
        notification_tasks,
        "load_claimed_risk_send_snapshot",
        AsyncMock(return_value=_snapshot(event_id)),
    )
    monkeypatch.setattr(notification_tasks, "send_scan_risk_webhook", AsyncMock(return_value=ScanRiskWebhookOutcome.CONFIRMED))
    monkeypatch.setattr(notification_tasks, "mark_claimed_risk_event_sent_in_transaction", mark_sent)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.CONFIRMATION_UNRECORDED
    mark_sent.assert_awaited_once()
    assert tracker.open_sessions == tracker.open_transactions == 0
