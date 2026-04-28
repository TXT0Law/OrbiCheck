"""Notification dispatch log ORM model (Phase 3 — channel adapter retry queue).

Each row represents one channel-level delivery attempt. The Phase 3 adapter
framework wraps every Slack / Discord / Teams / PagerDuty / webhook / email
send in a transactional ``record_attempt`` call so:

* failed deliveries become candidates for ``retry_notification_dispatch``
  (Celery task) up to ``max_attempts`` with exponential backoff;
* the dashboard can render a per-alert audit trail "delivered to Slack at
  hh:mm — failed twice — succeeded on attempt 3";
* PagerDuty's idempotent ``trigger`` / ``acknowledge`` / ``resolve`` keys
  share the row via ``dedup_key`` so the resolve event reuses the same key.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.alert_event import AlertEvent
    from app.models.monitor import Monitor


# Status string values; kept as plain str (not Enum) so historical rows stay
# valid if/when we add new states (e.g. "queued") without a migration.
NOTIFICATION_DISPATCH_STATUS_PENDING = "pending"
NOTIFICATION_DISPATCH_STATUS_SUCCEEDED = "succeeded"
NOTIFICATION_DISPATCH_STATUS_FAILED = "failed"
NOTIFICATION_DISPATCH_STATUS_DEAD = "dead"


class NotificationDispatchLog(Base):
    __tablename__ = "osint_notification_dispatch_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    monitor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=True,
    )
    alert_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_alert_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    channel_id: Mapped[str] = mapped_column(String(32), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    dedup_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    succeeded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    monitor: Mapped["Monitor | None"] = relationship()
    alert_event: Mapped["AlertEvent | None"] = relationship()

    __table_args__ = (
        Index(
            "ix_osint_notif_dispatch_log_user_created",
            "user_id",
            "created_at",
        ),
        Index(
            "ix_osint_notif_dispatch_log_pending",
            "status",
            "next_attempt_at",
        ),
        Index(
            "ix_osint_notif_dispatch_log_dedup",
            "channel_id",
            "dedup_key",
        ),
    )
