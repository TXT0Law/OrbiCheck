"""Single-event scan-risk delivery keeps database and network phases separate."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import httpx
import pytest
from redis.exceptions import RedisError

from app.core.celery_app import SCAN_RISK_DISPATCH_INTERVAL_SECONDS
from app.services.finding_notification_event import (
    RISK_EVENT_DISPATCH_BATCH_SIZE,
    RISK_EVENT_UNRESOLVED_SAMPLE_SIZE,
    ClaimedRiskSendSnapshot,
)
from app.services.finding_notification_payload import ScanRiskNotificationPayload
from app.services.notification_channels import scan_risk_webhook
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
        (ScanRiskWebhookOutcome.DISABLED, "disabled"),
        (ScanRiskWebhookOutcome.BLOCKED, "blocked"),
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
    assert snapshot.await_count == 2
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
async def test_risk_delivery_connects_opt_in_to_safe_webhook_and_sent_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise the worker and real adapter together without external network I/O."""
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(
        monkeypatch,
        tracker,
        settings={
            "scanRiskEventsEnabled": True,
            "webhookEnabled": True,
            "webhookUrl": "https://hooks.example.com/risk",
        },
    )
    snapshot = _snapshot(event_id)
    mark_sent = AsyncMock(return_value=True)
    cancel = AsyncMock()
    requests: list[tuple[str, dict[str, Any], dict[str, str]]] = []

    async def capture_post(
        target: str, body: dict[str, Any], *, extra_headers: dict[str, str]
    ) -> None:
        assert tracker.open_sessions == tracker.open_transactions == 0
        requests.append((target, body, extra_headers))

    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(
        notification_tasks,
        "load_claimed_risk_send_snapshot",
        AsyncMock(return_value=snapshot),
    )
    monkeypatch.setattr(notification_tasks, "mark_claimed_risk_event_sent_in_transaction", mark_sent)
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(scan_risk_webhook, "validate_https_url", lambda target: target)
    monkeypatch.setattr(scan_risk_webhook, "post_json", capture_post)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.SENT
    assert len(requests) == 1
    target, body, headers = requests[0]
    assert target == "https://hooks.example.com/risk"
    assert headers == {"Idempotency-Key": str(event_id)}
    assert body["source"] == "orbicheck-scan-risk"
    assert body["event"] == "high_risk_new"
    assert body["data"]["eventId"] == str(event_id)
    assert body["data"]["ruleId"] == "ssl.certificate_expiry"
    assert "monitorId" not in body["data"]
    mark_sent.assert_awaited_once()
    cancel.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_risk_delivery_cancels_unattempted_claim_after_user_opts_out(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Current preferences can revoke a claimed event before external I/O."""
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(
        monkeypatch,
        tracker,
        settings={
            "scanRiskEventsEnabled": False,
            "webhookEnabled": True,
            "webhookUrl": "https://hooks.example.com/risk",
        },
    )
    snapshot = AsyncMock(return_value=_snapshot(event_id))
    cancel = AsyncMock(return_value=True)
    mark_sent = AsyncMock()
    post = AsyncMock()
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(notification_tasks, "load_claimed_risk_send_snapshot", snapshot)
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(notification_tasks, "mark_claimed_risk_event_sent_in_transaction", mark_sent)
    monkeypatch.setattr(scan_risk_webhook, "post_json", post)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.DISABLED
    assert snapshot.await_count == 2
    cancel.assert_awaited_once_with(tracker, event_id, token)
    post.assert_not_awaited()
    mark_sent.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_risk_delivery_keeps_claim_after_uncertain_webhook_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A timed-out request may have arrived, so the worker must not cancel or mark it sent."""
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(
        monkeypatch,
        tracker,
        settings={
            "scanRiskEventsEnabled": True,
            "webhookEnabled": True,
            "webhookUrl": "https://hooks.example.com/risk",
        },
    )
    post = AsyncMock(side_effect=httpx.ReadTimeout("response unavailable"))
    cancel = AsyncMock()
    mark_sent = AsyncMock()
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
    monkeypatch.setattr(scan_risk_webhook, "validate_https_url", lambda target: target)
    monkeypatch.setattr(scan_risk_webhook, "post_json", post)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.UNKNOWN
    post.assert_awaited_once()
    cancel.assert_not_awaited()
    mark_sent.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


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
async def test_risk_delivery_rechecks_claim_after_settings_before_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(monkeypatch, tracker)
    snapshot = AsyncMock(side_effect=[_snapshot(event_id), None])
    cancel = AsyncMock(return_value=True)
    send = AsyncMock()
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(notification_tasks, "load_claimed_risk_send_snapshot", snapshot)
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(notification_tasks, "send_scan_risk_webhook", send)

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.CANCELLED
    assert snapshot.await_count == 2
    cancel.assert_awaited_once()
    send.assert_not_awaited()
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "webhook_result", [ScanRiskWebhookOutcome.DISABLED, ScanRiskWebhookOutcome.BLOCKED]
)
async def test_single_risk_delivery_reports_stale_if_unattempted_claim_was_cancelled_elsewhere(
    monkeypatch: pytest.MonkeyPatch, webhook_result: ScanRiskWebhookOutcome
) -> None:
    event_id, token = uuid4(), uuid4()
    tracker = _SessionTracker()
    _patch_preflight(monkeypatch, tracker)
    cancel = AsyncMock(return_value=False)
    monkeypatch.setattr(
        notification_tasks, "claim_pending_risk_event_in_transaction", AsyncMock(return_value=token)
    )
    monkeypatch.setattr(
        notification_tasks, "load_claimed_risk_send_snapshot",
        AsyncMock(return_value=_snapshot(event_id)),
    )
    monkeypatch.setattr(notification_tasks, "cancel_unattempted_risk_event_claim_in_transaction", cancel)
    monkeypatch.setattr(
        notification_tasks, "send_scan_risk_webhook", AsyncMock(return_value=webhook_result)
    )

    outcome = await notification_tasks.deliver_one_scan_risk_event(event_id)

    assert outcome is notification_tasks.ScanRiskDeliveryOutcome.STALE
    cancel.assert_awaited_once()
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


@pytest.mark.unit
@pytest.mark.asyncio
async def test_risk_dispatch_batch_releases_candidate_session_before_each_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tracker = _SessionTracker()
    event_ids = [uuid4(), uuid4()]
    unresolved_id = uuid4()
    candidate_ids = AsyncMock(return_value=event_ids)
    expired_claims = AsyncMock(return_value=[unresolved_id])
    delivered: list[UUID] = []

    async def deliver(event_id: UUID) -> notification_tasks.ScanRiskDeliveryOutcome:
        assert tracker.open_sessions == 0
        assert tracker.open_transactions == 0
        delivered.append(event_id)
        return (
            notification_tasks.ScanRiskDeliveryOutcome.SENT
            if event_id == event_ids[0]
            else notification_tasks.ScanRiskDeliveryOutcome.UNKNOWN
        )

    monkeypatch.setattr(notification_tasks, "async_session_factory", tracker)
    monkeypatch.setattr(notification_tasks, "list_pending_risk_event_ids", candidate_ids)
    monkeypatch.setattr(notification_tasks, "list_expired_claimed_risk_event_ids", expired_claims)
    monkeypatch.setattr(notification_tasks, "deliver_one_scan_risk_event", deliver)
    log_info = Mock()
    monkeypatch.setattr(notification_tasks, "logger", SimpleNamespace(info=log_info))

    result = await notification_tasks._dispatch_pending_scan_risk_events()

    assert delivered == event_ids
    candidate_ids.assert_awaited_once_with(tracker, RISK_EVENT_DISPATCH_BATCH_SIZE)
    expired_claims.assert_awaited_once_with(tracker, RISK_EVENT_UNRESOLVED_SAMPLE_SIZE)
    assert result == {
        "candidates": 2,
        "outcomes": {"sent": 1, "unknown": 1},
        "unresolvedClaimIdsSample": [str(unresolved_id)],
    }
    log_info.assert_any_call(
        "scan_risk_dispatch_event_finished", event_id=str(event_ids[0]), outcome="sent"
    )
    log_info.assert_any_call(
        "scan_risk_dispatch_event_finished", event_id=str(event_ids[1]), outcome="unknown"
    )
    assert tracker.open_sessions == tracker.open_transactions == 0


@pytest.mark.unit
def test_risk_dispatch_task_has_no_automatic_retry_and_bounded_beat_schedule(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run_batch = AsyncMock(return_value={"candidates": 0, "outcomes": {}})
    monkeypatch.setattr(notification_tasks, "_dispatch_pending_scan_risk_events", run_batch)

    assert notification_tasks.dispatch_pending_scan_risk_events.max_retries == 0
    assert notification_tasks.dispatch_pending_scan_risk_events.run() == {
        "candidates": 0,
        "outcomes": {},
    }
    run_batch.assert_awaited_once()
    schedule = notification_tasks.celery_app.conf.beat_schedule[
        "dispatch-pending-scan-risk-events"
    ]
    assert schedule["task"] == notification_tasks.dispatch_pending_scan_risk_events.name
    assert schedule["schedule"] == SCAN_RISK_DISPATCH_INTERVAL_SECONDS
