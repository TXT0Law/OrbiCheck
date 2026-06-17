"""Add operational diagnostics events.

Revision ID: operational_events
Revises: add_report_schedules
Create Date: 2026-06-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "operational_events"
down_revision: Union[str, None] = "add_report_schedules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osint_operational_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=96), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("target_url", sa.String(length=2048), nullable=True),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("group_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("group_run_member_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error_code", sa.String(length=96), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("trace_id", sa.String(length=128), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["monitor_id"], ["osint_monitors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_id"], ["url_groups.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_run_id"], ["url_group_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["group_run_member_id"],
            ["url_group_run_members.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_osint_operational_events_user_created",
        "osint_operational_events",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_osint_operational_events_report_created",
        "osint_operational_events",
        ["report_id", "created_at"],
    )
    op.create_index(
        "ix_osint_operational_events_monitor_created",
        "osint_operational_events",
        ["monitor_id", "created_at"],
    )
    op.create_index(
        "ix_osint_operational_events_group_run_created",
        "osint_operational_events",
        ["group_run_id", "created_at"],
    )
    op.create_index(
        "ix_osint_operational_events_scan_created",
        "osint_operational_events",
        ["scan_id", "created_at"],
    )
    op.create_index(
        "ix_osint_operational_events_type_status_created",
        "osint_operational_events",
        ["event_type", "status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_osint_operational_events_type_status_created",
        table_name="osint_operational_events",
    )
    op.drop_index(
        "ix_osint_operational_events_scan_created",
        table_name="osint_operational_events",
    )
    op.drop_index(
        "ix_osint_operational_events_group_run_created",
        table_name="osint_operational_events",
    )
    op.drop_index(
        "ix_osint_operational_events_monitor_created",
        table_name="osint_operational_events",
    )
    op.drop_index(
        "ix_osint_operational_events_report_created",
        table_name="osint_operational_events",
    )
    op.drop_index(
        "ix_osint_operational_events_user_created",
        table_name="osint_operational_events",
    )
    op.drop_table("osint_operational_events")
