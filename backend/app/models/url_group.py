"""URL Group models for organizing multiple URLs."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UrlGroup(Base):
    """Group of URLs for batch organization and scanning."""

    __tablename__ = "url_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    members: Mapped[list["UrlGroupMember"]] = relationship(
        "UrlGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="UrlGroupMember.sort_order",
    )
    runs: Mapped[list["UrlGroupRun"]] = relationship(
        "UrlGroupRun",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="UrlGroupRun.created_at.desc()",
    )


class UrlGroupMember(Base):
    """Single URL membership in a group."""

    __tablename__ = "url_group_members"
    __table_args__ = (UniqueConstraint("group_id", "url", name="uq_group_url"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    display_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    group: Mapped["UrlGroup"] = relationship(
        "UrlGroup",
        back_populates="members",
    )
    run_members: Mapped[list["UrlGroupRunMember"]] = relationship(
        "UrlGroupRunMember",
        back_populates="group_member",
    )


class UrlGroupRunStatus(str, enum.Enum):
    """Lifecycle status for a URL group batch scan."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PARTIAL = "partial"


class UrlGroupRunMemberStatus(str, enum.Enum):
    """Lifecycle status for one member inside a group run."""

    QUEUED = "queued"
    CREATING_SCAN = "creating_scan"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class UrlGroupRun(Base):
    """First-class batch scan run for a URL group."""

    __tablename__ = "url_group_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    status: Mapped[UrlGroupRunStatus] = mapped_column(
        Enum(
            UrlGroupRunStatus,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        default=UrlGroupRunStatus.PENDING,
        nullable=False,
        index=True,
    )
    total_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    queued_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    running_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cancelled_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    skipped_members: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    concurrency_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    group: Mapped["UrlGroup"] = relationship("UrlGroup", back_populates="runs")
    members: Mapped[list["UrlGroupRunMember"]] = relationship(
        "UrlGroupRunMember",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="UrlGroupRunMember.created_at",
    )


class UrlGroupRunMember(Base):
    """Per-member orchestration row for a URL group run."""

    __tablename__ = "url_group_run_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_group_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("url_group_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[UrlGroupRunMemberStatus] = mapped_column(
        Enum(
            UrlGroupRunMemberStatus,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        default=UrlGroupRunMemberStatus.QUEUED,
        nullable=False,
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    run: Mapped["UrlGroupRun"] = relationship(
        "UrlGroupRun",
        back_populates="members",
    )
    group_member: Mapped["UrlGroupMember"] = relationship(
        "UrlGroupMember",
        back_populates="run_members",
    )
