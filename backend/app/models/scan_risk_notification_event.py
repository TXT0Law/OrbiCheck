"""Durable, episode-scoped queue for high-risk scan notifications.

The baseline scan ID is intentionally not a foreign key. Deleting that
historical scan must not erase an episode while its source scan still exists.
Deleting the source scan cascades to the event for scan retention and privacy.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.scan import Scan


RISK_EVENT_PENDING = "pending"
RISK_EVENT_CLAIMED = "claimed"
RISK_EVENT_SENT = "sent"
RISK_EVENT_CANCELLED = "cancelled"


class ScanRiskNotificationEvent(Base):
    __tablename__ = "scan_risk_notification_events"
    __table_args__ = (
        UniqueConstraint(
            "baseline_scan_id",
            "baseline_completed_at",
            "rule_id",
            "ruleset_version",
            name="uq_scan_risk_notification_episode",
        ),
        CheckConstraint("ruleset_version > 0", name="ck_scan_risk_notification_ruleset_version"),
        CheckConstraint(
            "kind IN ('new', 'regressed')", name="ck_scan_risk_notification_kind"
        ),
        CheckConstraint(
            "status IN ('pending', 'claimed', 'sent', 'cancelled')",
            name="ck_scan_risk_notification_status",
        ),
        CheckConstraint(
            "(status = 'claimed' AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL) "
            "OR (status != 'claimed' AND claim_token IS NULL AND claim_expires_at IS NULL)",
            name="ck_scan_risk_notification_claim",
        ),
        Index("ix_scan_risk_notification_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False
    )
    scan_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    baseline_scan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    baseline_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rule_id: Mapped[str] = mapped_column(String(96), nullable=False)
    ruleset_version: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=RISK_EVENT_PENDING
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claim_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    claim_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    scan: Mapped[Scan] = relationship()
