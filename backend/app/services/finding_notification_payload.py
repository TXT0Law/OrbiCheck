"""Small scan-risk notification payload independent of monitor alerts."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.scan import Scan, ScanStatus
from app.models.scan_risk_notification_event import RISK_EVENT_CLAIMED, ScanRiskNotificationEvent
from app.services.finding_transition import HIGH_RISK_SEVERITIES

MAX_NOTIFICATION_DOMAIN_LENGTH = 255
MAX_NOTIFICATION_RULE_ID_LENGTH = 96


class ScanRiskNotificationPayload(BaseModel):
    """Only stable finding identity and target host; never raw scan evidence."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    event_id: uuid.UUID
    scan_id: uuid.UUID
    domain: str = Field(
        min_length=1, max_length=MAX_NOTIFICATION_DOMAIN_LENGTH, pattern=r"^[\w.-]+$"
    )
    rule_id: str = Field(
        min_length=1, max_length=MAX_NOTIFICATION_RULE_ID_LENGTH, pattern=r"^[a-z0-9_.]+$"
    )
    ruleset_version: int = Field(gt=0)
    change_kind: Literal["new", "regressed"]
    severity: Literal["high", "critical"]
    scan_completed_at: datetime
    dashboard_path: str

    @field_validator("scan_completed_at")
    @classmethod
    def require_aware_completion(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Scan completion time must include a timezone")
        return value

    @model_validator(mode="after")
    def require_local_scan_path(self) -> ScanRiskNotificationPayload:
        if self.dashboard_path != f"/dashboard/scan/{self.scan_id}":
            raise ValueError("Dashboard path must match the source scan")
        return self


def build_scan_risk_notification_payload(
    event: ScanRiskNotificationEvent, scan: Scan
) -> ScanRiskNotificationPayload:
    """Project a claimed event without leaking URL paths or module results.

    The dispatch worker must first validate the claim token and current
    evidence. This builder also checks the event/scan generation and finding
    identity before producing any outbound data.
    """
    if (
        event.id is None
        or event.status != RISK_EVENT_CLAIMED
        or event.scan_id != scan.id
        or scan.status != ScanStatus.COMPLETED
        or scan.completed_at is None
        or event.scan_completed_at != scan.completed_at
        or event.ruleset_version != scan.finding_ruleset_version
    ):
        raise ValueError("Risk event source scan is not a matching completed generation")
    finding = next(
        (
            row
            for row in scan.finding_observations
            if row.rule_id == event.rule_id
            and row.ruleset_version == event.ruleset_version
            and row.severity in HIGH_RISK_SEVERITIES
        ),
        None,
    )
    if finding is None:
        raise ValueError("Risk event has no matching high-risk observation")

    return ScanRiskNotificationPayload(
        event_id=event.id,
        scan_id=scan.id,
        domain=scan.domain,
        rule_id=event.rule_id,
        ruleset_version=event.ruleset_version,
        change_kind=event.kind,
        severity=finding.severity,
        scan_completed_at=scan.completed_at,
        dashboard_path=f"/dashboard/scan/{scan.id}",
    )
