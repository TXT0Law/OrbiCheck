import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True, default=1)
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus), default=ScanStatus.PENDING, nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    total_modules: Mapped[int] = mapped_column(Integer, default=0)
    completed_modules: Mapped[int] = mapped_column(Integer, default=0)
    security_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scan_options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    module_results: Mapped[list["ScanModuleResult"]] = relationship(
        back_populates="scan",
        cascade="all, delete-orphan",
    )


class ModuleStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    # S-10: a module is RETRYING when its enclosing batch HTTP call to the
    # scan-service failed (Connection / 5xx / timeout) but the orchestrator
    # has scheduled an isolated per-module retry. Operators see this in the
    # UI instead of an instant red FAILED ❌, which previously masked the
    # fact that the failure was transient (target site degraded, not the
    # module itself). The state is terminal-only after the retry completes
    # (then transitions to SUCCESS / FAILED / TIMEOUT).
    RETRYING = "retrying"


class ScanModuleResult(Base):
    __tablename__ = "scan_module_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
    )
    module_name: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[ModuleStatus] = mapped_column(
        Enum(ModuleStatus),
        default=ModuleStatus.PENDING,
        nullable=False,
    )
    raw_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    scan: Mapped["Scan"] = relationship(back_populates="module_results")
