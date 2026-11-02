"""Scan-risk messages carry stable identity without raw target evidence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.scan import Scan, ScanFindingObservation, ScanStatus
from app.models.scan_risk_notification_event import RISK_EVENT_CLAIMED, ScanRiskNotificationEvent
from app.services.finding_notification_payload import (
    MAX_NOTIFICATION_DOMAIN_LENGTH,
    ScanRiskNotificationPayload,
    build_scan_risk_notification_payload,
)

COMPLETED_AT = datetime(2026, 11, 2, tzinfo=timezone.utc)
RULE_ID = "ssl.certificate_expiry"
RULESET_VERSION = 1


def _source() -> tuple[ScanRiskNotificationEvent, Scan]:
    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com/private?token=secret",
        status=ScanStatus.COMPLETED,
        completed_at=COMPLETED_AT,
        finding_ruleset_version=RULESET_VERSION,
    )
    scan.finding_observations = [
        ScanFindingObservation(
            rule_id=RULE_ID,
            ruleset_version=RULESET_VERSION,
            severity="high",
            title="SSL risk",
            description="Secret raw evidence",
            evidence_modules=["ssl"],
            observed_at=COMPLETED_AT,
        )
    ]
    event = ScanRiskNotificationEvent(
        id=uuid4(),
        scan_id=scan.id,
        scan_completed_at=COMPLETED_AT,
        baseline_scan_id=uuid4(),
        baseline_completed_at=COMPLETED_AT - timedelta(days=1),
        rule_id=RULE_ID,
        ruleset_version=RULESET_VERSION,
        kind="new",
        status=RISK_EVENT_CLAIMED,
    )
    return event, scan


@pytest.mark.unit
def test_scan_risk_payload_contains_only_bounded_identity_and_dashboard_path() -> None:
    event, scan = _source()

    payload = build_scan_risk_notification_payload(event, scan)

    assert payload.event_id == event.id
    assert payload.scan_id == scan.id
    assert payload.domain == "example.com"
    assert payload.rule_id == RULE_ID
    assert payload.change_kind == "new"
    assert payload.severity == "high"
    assert payload.dashboard_path == f"/dashboard/scan/{scan.id}"
    encoded = payload.model_dump_json()
    assert "private" not in encoded
    assert "secret" not in encoded
    assert "evidence_modules" not in encoded
    assert "monitor_id" not in encoded


@pytest.mark.unit
def test_scan_risk_payload_rejects_stale_event_or_missing_high_risk_observation() -> None:
    event, scan = _source()
    scan.completed_at += timedelta(minutes=1)
    with pytest.raises(ValueError, match="generation"):
        build_scan_risk_notification_payload(event, scan)

    scan.completed_at = COMPLETED_AT
    scan.finding_observations[0].severity = "low"
    with pytest.raises(ValueError, match="high-risk observation"):
        build_scan_risk_notification_payload(event, scan)


@pytest.mark.unit
def test_scan_risk_payload_validates_boundary_values() -> None:
    event, scan = _source()
    payload = build_scan_risk_notification_payload(event, scan)
    values = payload.model_dump()
    values["scan_completed_at"] = COMPLETED_AT.replace(tzinfo=None)
    with pytest.raises(ValidationError, match="timezone"):
        ScanRiskNotificationPayload.model_validate(values)

    values["scan_completed_at"] = COMPLETED_AT
    values["domain"] = "x" * (MAX_NOTIFICATION_DOMAIN_LENGTH + 1)
    with pytest.raises(ValidationError, match="at most 255"):
        ScanRiskNotificationPayload.model_validate(values)

    values["domain"] = "example.com/private"
    with pytest.raises(ValidationError, match="pattern"):
        ScanRiskNotificationPayload.model_validate(values)

    values["domain"] = "example.com"
    values["dashboard_path"] = "https://untrusted.example/scan"
    with pytest.raises(ValidationError, match="Dashboard path"):
        ScanRiskNotificationPayload.model_validate(values)
