"""Risk notification queue preserves one event per proven risk episode."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import CheckConstraint, UniqueConstraint

from app.models.scan import Scan, ScanStatus
from app.models.scan_risk_notification_event import (
    RISK_EVENT_CLAIMED,
    RISK_EVENT_PENDING,
    ScanRiskNotificationEvent,
)
from app.services.finding_identity import FINDING_RULESET_VERSION

TEST_USER_ID = 7


@pytest.mark.unit
def test_episode_key_is_unique_across_source_scans() -> None:
    table = ScanRiskNotificationEvent.__table__
    unique_keys = {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert (
        "baseline_scan_id",
        "baseline_completed_at",
        "rule_id",
        "ruleset_version",
    ) in unique_keys
    assert not table.c.baseline_scan_id.foreign_keys
    assert table.c.status.default.arg == RISK_EVENT_PENDING
    assert {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    } == {
        "ck_scan_risk_notification_ruleset_version",
        "ck_scan_risk_notification_kind",
        "ck_scan_risk_notification_status",
        "ck_scan_risk_notification_claim",
    }
    constraints = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert RISK_EVENT_CLAIMED in constraints["ck_scan_risk_notification_status"]
    assert "claim_token IS NOT NULL" in constraints["ck_scan_risk_notification_claim"]
    assert "claim_expires_at IS NOT NULL" in constraints["ck_scan_risk_notification_claim"]
    assert table.c.claim_token.nullable
    assert table.c.claim_expires_at.nullable


@pytest.mark.unit
def test_source_scan_controls_event_ownership_and_retention() -> None:
    table = ScanRiskNotificationEvent.__table__
    scan_fk = next(iter(table.c.scan_id.foreign_keys))
    assert scan_fk.target_fullname == "scans.id"
    assert scan_fk.ondelete == "CASCADE"
    assert "user_id" not in table.c
    assert "domain" not in table.c

    completed_at = datetime.now(timezone.utc)
    scan = Scan(
        id=uuid4(),
        user_id=TEST_USER_ID,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
        completed_at=completed_at,
    )
    event = ScanRiskNotificationEvent(
        scan=scan,
        scan_completed_at=completed_at,
        baseline_scan_id=uuid4(),
        baseline_completed_at=completed_at,
        rule_id="ssl.certificate_expiry",
        ruleset_version=FINDING_RULESET_VERSION,
        kind="new",
    )

    assert event.scan.user_id == TEST_USER_ID
    assert event.scan.domain == "example.com"
