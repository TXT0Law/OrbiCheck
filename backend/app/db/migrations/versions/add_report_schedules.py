"""Add report schedules.

Revision ID: add_report_schedules
Revises: add_url_group_runs
Create Date: 2026-06-01
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "add_report_schedules"
down_revision: Union[str, None] = "add_url_group_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "report_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("monitor_period", sa.String(length=10), nullable=True),
        sa.Column(
            "format",
            sa.Enum("pdf", "markdown", "html", "both", "all", name="reportformat", native_enum=False),
            nullable=False,
        ),
        sa.Column(
            "cadence",
            sa.Enum("weekly", "monthly", name="reportschedulecadence", native_enum=False),
            nullable=False,
        ),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("hour", sa.Integer(), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=False),
        sa.Column("delivery_channels", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("email_recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["monitor_id"], ["osint_monitors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_schedules_user_id", "report_schedules", ["user_id"])
    op.create_index("ix_report_schedules_is_enabled", "report_schedules", ["is_enabled"])
    op.create_index("ix_report_schedules_next_run_at", "report_schedules", ["next_run_at"])
    op.create_index(
        "ix_report_schedules_enabled_next_run",
        "report_schedules",
        ["is_enabled", "next_run_at"],
    )

    op.create_table(
        "report_schedule_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "generating",
                "delivering",
                "completed",
                "failed",
                name="reportschedulerunstatus",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("delivery_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["schedule_id"], ["report_schedules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_schedule_runs_schedule_id", "report_schedule_runs", ["schedule_id"])
    op.create_index("ix_report_schedule_runs_report_id", "report_schedule_runs", ["report_id"])
    op.create_index("ix_report_schedule_runs_status", "report_schedule_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_report_schedule_runs_status", table_name="report_schedule_runs")
    op.drop_index("ix_report_schedule_runs_report_id", table_name="report_schedule_runs")
    op.drop_index("ix_report_schedule_runs_schedule_id", table_name="report_schedule_runs")
    op.drop_table("report_schedule_runs")
    op.drop_index("ix_report_schedules_enabled_next_run", table_name="report_schedules")
    op.drop_index("ix_report_schedules_next_run_at", table_name="report_schedules")
    op.drop_index("ix_report_schedules_is_enabled", table_name="report_schedules")
    op.drop_index("ix_report_schedules_user_id", table_name="report_schedules")
    op.drop_table("report_schedules")
