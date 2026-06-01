import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.report import ReportFormat


class ReportScheduleCadence(str, enum.Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ReportScheduleRunStatus(str, enum.Enum):
    PENDING = "pending"
    GENERATING = "generating"
    DELIVERING = "delivering"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportSchedule(Base):
    __tablename__ = "report_schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scans.id", ondelete="SET NULL"), nullable=True
    )
    monitor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("osint_monitors.id", ondelete="SET NULL"),
        nullable=True,
    )
    monitor_period: Mapped[str | None] = mapped_column(String(10), nullable=True)
    format: Mapped[ReportFormat] = mapped_column(
        Enum(ReportFormat, native_enum=False, length=16), nullable=False
    )
    cadence: Mapped[ReportScheduleCadence] = mapped_column(
        Enum(ReportScheduleCadence, native_enum=False, length=16), nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    minute: Mapped[int] = mapped_column(Integer, nullable=False)
    delivery_channels: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    email_recipients: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    runs: Mapped[list["ReportScheduleRun"]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="ReportScheduleRun.started_at.desc()",
    )


class ReportScheduleRun(Base):
    __tablename__ = "report_schedule_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("report_schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ReportScheduleRunStatus] = mapped_column(
        Enum(ReportScheduleRunStatus, native_enum=False, length=16),
        nullable=False,
        default=ReportScheduleRunStatus.PENDING,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    schedule: Mapped[ReportSchedule] = relationship(back_populates="runs")
