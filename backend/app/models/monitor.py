"""Monitor ORM models for uptime and change detection.

NOTE: Primary keys in this module are UUID (PostgreSQL UUID type).

MonitorChange foreign keys to snapshots use columns ``previous_snapshot_id`` and
``current_snapshot_id`` (SET NULL on snapshot delete). The HTTP API serializes
these as ``snapshotBeforeId`` / ``snapshotAfterId`` (see Pydantic schemas).

HTTP request extensions (1.1):
    * ``http_body`` is a UTF-8 text payload (size capped via Pydantic; see
      ``app.core.monitor_defaults.MAX_REQUEST_BODY_BYTES``).
    * ``http_headers`` is a JSONB ``dict[str, str]`` (validated for forbidden
      header names + count + value length on the API boundary; never Host /
      Content-Length etc.).
    * ``http_auth`` is a JSONB envelope ``{"scheme": "...", "token_ciphertext":
      "..."}`` containing a Fernet-encrypted secret. Plaintext NEVER lands in
      the DB or logs (see ``app.core.secrets``).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.alert_event import AlertEvent


class MonitorStatus(str, enum.Enum):
    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    PAUSED = "paused"
    PENDING = "pending"


class CheckErrorType(str, enum.Enum):
    TIMEOUT = "timeout"
    DNS_RESOLUTION = "dns_resolution"
    CONNECTION_REFUSED = "connection_refused"
    SSL_ERROR = "ssl_error"
    HTTP_ERROR = "http_error"
    CONTENT_TOO_LARGE = "content_too_large"
    UNKNOWN = "unknown"


class Monitor(Base):
    # Prefixed to avoid clashing with unrelated DB tables named "monitors" (e.g. integer PK).
    __tablename__ = "osint_monitors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True, default=1)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    capabilities: Mapped[dict] = mapped_column(JSONB, nullable=False)
    enabled_capabilities: Mapped[list[str]] = mapped_column(ARRAY(String(32)), nullable=False)
    interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    http_method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    # 1.1: optional UTF-8 request body (size enforced at API boundary).
    http_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 1.1: optional dict[str,str] of additional headers (lowercased name guard at API).
    http_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # 1.1: encrypted auth envelope {"scheme": "bearer"|"basic", "token_ciphertext": "<fernet>"}.
    # Plaintext lives only in process memory at probe time; never logged.
    http_auth: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    expected_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[MonitorStatus] = mapped_column(
        Enum(MonitorStatus, native_enum=False, length=16),
        nullable=False,
        default=MonitorStatus.PENDING,
    )
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(50)), nullable=False)

    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_change_detected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ssl_expiry_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_ssl_probe_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    total_checks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_changes_detected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uptime_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Phase 2.1: persisted percentiles over the last 30 days of successful checks.
    # Recomputed by `_recompute_rolling_stats`; null when no successful samples.
    p50_response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    p95_response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    p99_response_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    checks: Mapped[list["MonitorCheck"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["MonitorSnapshot"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )
    changes: Mapped[list["MonitorChange"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )
    visual_captures: Mapped[list["MonitorVisualCapture"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )
    visual_changes: Mapped[list["MonitorVisualChange"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )
    alert_events: Mapped[list["AlertEvent"]] = relationship(
        "AlertEvent",
        back_populates="monitor",
        cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_osint_monitors_user_enabled", "user_id", "is_enabled"),)


class MonitorCheck(Base):
    __tablename__ = "osint_monitor_checks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_time_ms: Mapped[float] = mapped_column(Float, nullable=False)
    error_type: Mapped[CheckErrorType | None] = mapped_column(
        Enum(CheckErrorType, native_enum=False, length=32),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_changed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    ssl_days_remaining: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ssl_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    evaluated_capabilities: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)),
        nullable=False,
        server_default="{}",
    )

    monitor: Mapped[Monitor] = relationship(back_populates="checks")

    __table_args__ = (
        Index("ix_osint_monitor_checks_monitor_time", "monitor_id", "checked_at"),
    )


class MonitorSnapshot(Base):
    __tablename__ = "osint_monitor_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitor_checks.id", ondelete="CASCADE"),
        nullable=False,
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    charset: Mapped[str | None] = mapped_column(String(50), nullable=True)
    http_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_baseline: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    normalization_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="0 = raw body; future versions = applied normalization pipeline",
    )

    monitor: Mapped[Monitor] = relationship(back_populates="snapshots")

    __table_args__ = (
        Index("ix_osint_snapshots_monitor_time", "monitor_id", "captured_at"),
    )


class MonitorChange(Base):
    __tablename__ = "osint_monitor_changes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    previous_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitor_snapshots.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitor_snapshots.id", ondelete="SET NULL"),
        nullable=True,
    )
    diff_summary: Mapped[dict] = mapped_column(JSONB, nullable=False)
    change_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    threshold_met: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # When True, SSE content_changed was published; False = suppressed; NULL = legacy rows.
    notification_dispatched: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    monitor: Mapped[Monitor] = relationship(back_populates="changes")
    snapshot_before: Mapped["MonitorSnapshot | None"] = relationship(
        foreign_keys=[previous_snapshot_id],
    )
    snapshot_after: Mapped["MonitorSnapshot | None"] = relationship(
        foreign_keys=[current_snapshot_id],
    )

    __table_args__ = (
        Index("ix_osint_changes_monitor_detected", "monitor_id", "detected_at"),
    )


class MonitorVisualCapture(Base):
    __tablename__ = "osint_monitor_visual_captures"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    check_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitor_checks.id", ondelete="SET NULL"),
        nullable=True,
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    image_png: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, nullable=False)
    viewport_width: Mapped[int] = mapped_column(Integer, nullable=False)
    viewport_height: Mapped[int] = mapped_column(Integer, nullable=False)
    full_page: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    perceptual_hash_hex: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dhash_algo: Mapped[str] = mapped_column(String(16), nullable=False, default="dhash")

    monitor: Mapped[Monitor] = relationship(back_populates="visual_captures")

    __table_args__ = (
        Index("ix_osint_visual_captures_monitor_time", "monitor_id", "captured_at"),
    )


class MonitorDnsRecord(Base):
    """Latest observed DNS record set per (monitor, record_type).

    Phase 2.2: serves as the cached "current" snapshot we diff every probe.
    Values are stored as a JSONB array of strings (sorted, lowercased) so we
    can compare two record sets purely as Python sets without losing TTL data
    if we add it later.
    """

    __tablename__ = "osint_monitor_dns_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    record_type: Mapped[str] = mapped_column(String(8), nullable=False)
    values: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_change_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    monitor: Mapped[Monitor] = relationship()

    __table_args__ = (
        Index(
            "ix_osint_dns_records_monitor_type",
            "monitor_id",
            "record_type",
            unique=True,
        ),
    )


class MonitorDnsChange(Base):
    """Append-only history of DNS record-set changes (added / removed values)."""

    __tablename__ = "osint_monitor_dns_changes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    record_type: Mapped[str] = mapped_column(String(8), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    previous_values: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    current_values: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    added_values: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    removed_values: Mapped[list[str]] = mapped_column(JSONB, nullable=False)

    monitor: Mapped[Monitor] = relationship()

    __table_args__ = (
        Index(
            "ix_osint_dns_changes_monitor_detected",
            "monitor_id",
            "detected_at",
        ),
    )


class MonitorCtEntry(Base):
    """Certificate Transparency log entry observed for a monitor's hostname.

    Phase 2.3: rows are populated by polling crt.sh; ``serial_number`` +
    ``leaf_sha256`` together identify a unique cert. ``alerted_at`` records
    whether/when an alert dispatch happened so we never re-alert the same row.
    """

    __tablename__ = "osint_monitor_ct_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    hostname: Mapped[str] = mapped_column(String(253), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(80), nullable=False)
    leaf_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    issuer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    common_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    not_before: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    not_after: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    crtsh_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pin_violation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    alerted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    monitor: Mapped[Monitor] = relationship()

    __table_args__ = (
        Index(
            "ix_osint_ct_entries_monitor_serial",
            "monitor_id",
            "serial_number",
            unique=True,
        ),
        Index("ix_osint_ct_entries_observed", "monitor_id", "observed_at"),
    )


class MaintenanceWindow(Base):
    """Phase 2.4: time range during which probes/alerts are suppressed.

    Linked either to a single monitor (``monitor_id``) or applied user-wide
    (``monitor_id`` IS NULL). Active when ``starts_at <= now < ends_at`` and
    ``is_enabled``.
    """

    __tablename__ = "osint_maintenance_windows"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    monitor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    suppress_alerts: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    suppress_probes: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    monitor: Mapped[Monitor | None] = relationship()

    __table_args__ = (
        Index(
            "ix_osint_maint_windows_active",
            "user_id",
            "is_enabled",
            "starts_at",
            "ends_at",
        ),
    )


class MonitorVisualChange(Base):
    __tablename__ = "osint_monitor_visual_changes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="CASCADE"),
        nullable=False,
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    previous_capture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitor_visual_captures.id", ondelete="CASCADE"),
        nullable=False,
    )
    current_capture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitor_visual_captures.id", ondelete="CASCADE"),
        nullable=False,
    )
    diff_summary: Mapped[dict] = mapped_column(JSONB, nullable=False)

    monitor: Mapped[Monitor] = relationship(back_populates="visual_changes")

    __table_args__ = (
        Index("ix_osint_visual_changes_monitor_detected", "monitor_id", "detected_at"),
    )
