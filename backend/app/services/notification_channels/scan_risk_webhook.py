"""Dedicated scan-risk webhook contract, separate from monitor alerts."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Mapping

import httpx
import structlog

from app.services.finding_notification_payload import ScanRiskNotificationPayload
from app.services.notification_channels._helpers import post_json, validate_https_url

SCAN_RISK_WEBHOOK_SOURCE = "orbicheck-scan-risk"
SCAN_RISK_EVENT_PREFIX = "high_risk_"
logger = structlog.get_logger(__name__)


class ScanRiskWebhookOutcome(StrEnum):
    """Keep uncertain delivery distinct from a confirmed rejection before I/O."""

    DISABLED = "disabled"
    BLOCKED = "blocked"
    CONFIRMED = "confirmed"
    UNKNOWN = "unknown"


def scan_risk_webhook_target(user_settings: Mapping[str, Any]) -> str | None:
    """Require explicit scan-risk opt-in and a configured HTTPS webhook.

    This does not grant delivery permission: the worker must also hold a live
    event claim and recheck current scan evidence before any network I/O.
    """
    if (
        user_settings.get("scanRiskEventsEnabled") is not True
        or user_settings.get("webhookEnabled") is not True
    ):
        return None
    target = user_settings.get("webhookUrl")
    if not isinstance(target, str) or not target.strip():
        return None
    return validate_https_url(target)


def build_scan_risk_webhook_body(payload: ScanRiskNotificationPayload) -> dict[str, Any]:
    """Serialize only the reviewed scan-risk fields for webhook consumers."""
    return {
        "source": SCAN_RISK_WEBHOOK_SOURCE,
        "event": f"{SCAN_RISK_EVENT_PREFIX}{payload.change_kind}",
        "data": {
            "eventId": str(payload.event_id),
            "scanId": str(payload.scan_id),
            "domain": payload.domain,
            "ruleId": payload.rule_id,
            "rulesetVersion": payload.ruleset_version,
            "changeKind": payload.change_kind,
            "severity": payload.severity,
            "scanCompletedAt": payload.scan_completed_at.isoformat(),
            "dashboardPath": payload.dashboard_path,
        },
    }


async def send_scan_risk_webhook(
    payload: ScanRiskNotificationPayload,
    user_settings: Mapping[str, Any],
) -> ScanRiskWebhookOutcome:
    """Attempt one send; never infer non-delivery from a network failure.

    Callers must commit a live claim and recheck its evidence before invoking
    this adapter. An unknown result must not be automatically retried.
    """
    try:
        target = scan_risk_webhook_target(user_settings)
    except ValueError:
        return ScanRiskWebhookOutcome.BLOCKED
    if target is None:
        return ScanRiskWebhookOutcome.DISABLED

    try:
        await post_json(
            target,
            build_scan_risk_webhook_body(payload),
            extra_headers={"Idempotency-Key": str(payload.event_id)},
        )
    except (httpx.HTTPError, ValueError, OSError) as exc:
        logger.warning(
            "scan_risk_webhook_delivery_unknown",
            event_id=str(payload.event_id),
            error_type=type(exc).__name__,
        )
        return ScanRiskWebhookOutcome.UNKNOWN
    return ScanRiskWebhookOutcome.CONFIRMED
