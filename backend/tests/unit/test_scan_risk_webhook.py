"""Scan-risk webhook identity and opt-in are independent of monitor alerts."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.services.finding_notification_payload import ScanRiskNotificationPayload
from app.services.notification_channels import scan_risk_webhook

COMPLETED_AT = datetime(2026, 11, 2, tzinfo=timezone.utc)
WEBHOOK_URL = "https://hooks.example.com/orbicheck"
RULESET_VERSION = 1


def _payload() -> ScanRiskNotificationPayload:
    scan_id = uuid4()
    return ScanRiskNotificationPayload(
        event_id=uuid4(),
        scan_id=scan_id,
        domain="example.com",
        rule_id="ssl.certificate_expiry",
        ruleset_version=RULESET_VERSION,
        change_kind="regressed",
        severity="high",
        scan_completed_at=COMPLETED_AT,
        dashboard_path=f"/dashboard/scan/{scan_id}",
    )


@pytest.mark.unit
def test_scan_risk_webhook_body_has_dedup_identity_and_no_monitor_fields() -> None:
    payload = _payload()
    body = scan_risk_webhook.build_scan_risk_webhook_body(payload)

    assert body["source"] == "orbicheck-scan-risk"
    assert body["event"] == "high_risk_regressed"
    assert body["data"] == {
        "eventId": str(payload.event_id),
        "scanId": str(payload.scan_id),
        "domain": "example.com",
        "ruleId": "ssl.certificate_expiry",
        "rulesetVersion": RULESET_VERSION,
        "changeKind": "regressed",
        "severity": "high",
        "scanCompletedAt": COMPLETED_AT.isoformat(),
        "dashboardPath": f"/dashboard/scan/{payload.scan_id}",
    }
    assert "monitorId" not in body
    assert "rawResult" not in body["data"]


@pytest.mark.unit
def test_scan_risk_webhook_requires_explicit_opt_in_and_configured_target(monkeypatch) -> None:
    validated: list[str] = []

    def validate(target: str) -> str:
        validated.append(target)
        return target

    monkeypatch.setattr(scan_risk_webhook, "validate_https_url", validate)
    config = {"webhookEnabled": True, "webhookUrl": WEBHOOK_URL}

    assert scan_risk_webhook.scan_risk_webhook_target(config) is None
    assert scan_risk_webhook.scan_risk_webhook_target(
        {**config, "scanRiskEventsEnabled": "true"}
    ) is None
    assert scan_risk_webhook.scan_risk_webhook_target(
        {**config, "scanRiskEventsEnabled": True, "webhookEnabled": False}
    ) is None
    assert validated == []

    assert scan_risk_webhook.scan_risk_webhook_target(
        {**config, "scanRiskEventsEnabled": True}
    ) == WEBHOOK_URL
    assert validated == [WEBHOOK_URL]


@pytest.mark.unit
def test_scan_risk_webhook_rejects_invalid_enabled_target(monkeypatch) -> None:
    def reject(_target: str) -> str:
        raise ValueError("HTTPS target required")

    monkeypatch.setattr(scan_risk_webhook, "validate_https_url", reject)
    with pytest.raises(ValueError, match="HTTPS"):
        scan_risk_webhook.scan_risk_webhook_target(
            {
                "scanRiskEventsEnabled": True,
                "webhookEnabled": True,
                "webhookUrl": "http://example.com/hook",
            }
        )
