"""Operational diagnostics event model.

This is a local audit trail for self-hosted operations, not an enterprise
compliance log. Keep messages short and payloads sanitized before storing.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OperationalEvent(Base):
    __tablename__ = "osint_operational_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(96), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    target_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    monitor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    group_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_group_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    group_run_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_group_run_members.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(96), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    trace_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    details: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_osint_operational_events_user_created", "user_id", "created_at"),
        Index("ix_osint_operational_events_report_created", "report_id", "created_at"),
        Index("ix_osint_operational_events_monitor_created", "monitor_id", "created_at"),
        Index("ix_osint_operational_events_group_run_created", "group_run_id", "created_at"),
        Index("ix_osint_operational_events_scan_created", "scan_id", "created_at"),
        Index("ix_osint_operational_events_type_status_created", "event_type", "status", "created_at"),
    )
