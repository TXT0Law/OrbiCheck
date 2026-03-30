"""Add osint_monitors and related tables (prefixed to avoid DB name collisions).

Revision ID: add_osint_monitors
Revises: add_url_groups
Create Date: 2026-03-24

Table names use the osint_ prefix so we do not conflict with existing tables
named ``monitors`` (e.g. integer PK) in shared PostgreSQL instances.

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "add_osint_monitors"
down_revision: Union[str, None] = "add_url_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osint_monitors",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("check_type", sa.String(length=32), nullable=False),
        sa.Column("interval_seconds", sa.Integer(), nullable=False),
        sa.Column("http_method", sa.String(length=10), nullable=False),
        sa.Column("expected_status_code", sa.Integer(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String(length=50)),
            server_default=sa.text("ARRAY[]::varchar(50)[]"),
            nullable=False,
        ),
        sa.Column("last_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
        sa.Column("last_response_time_ms", sa.Float(), nullable=True),
        sa.Column("last_change_detected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_content_hash", sa.String(length=64), nullable=True),
        sa.Column("ssl_expiry_days", sa.Integer(), nullable=True),
        sa.Column("total_checks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uptime_percentage", sa.Float(), nullable=True),
        sa.Column("avg_response_time_ms", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_osint_monitors_user_id", "osint_monitors", ["user_id"])
    op.create_index(
        "ix_osint_monitors_user_enabled",
        "osint_monitors",
        ["user_id", "is_enabled"],
    )

    op.create_table(
        "osint_monitor_checks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("monitor_id", sa.Uuid(), nullable=False),
        sa.Column(
            "checked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("response_time_ms", sa.Float(), nullable=False),
        sa.Column("error_type", sa.String(length=32), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "content_changed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("snapshot_id", sa.Uuid(), nullable=True),
        sa.Column("ssl_days_remaining", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_osint_monitor_checks_monitor_time",
        "osint_monitor_checks",
        ["monitor_id", "checked_at"],
    )

    op.create_table(
        "osint_monitor_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("monitor_id", sa.Uuid(), nullable=False),
        sa.Column("check_id", sa.Uuid(), nullable=False),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("content_size_bytes", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["check_id"], ["osint_monitor_checks.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_osint_snapshots_monitor_time",
        "osint_monitor_snapshots",
        ["monitor_id", "captured_at"],
    )

    op.create_table(
        "osint_monitor_changes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("monitor_id", sa.Uuid(), nullable=False),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("previous_snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("current_snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("diff_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["previous_snapshot_id"],
            ["osint_monitor_snapshots.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["current_snapshot_id"],
            ["osint_monitor_snapshots.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("osint_monitor_changes")
    op.drop_index(
        "ix_osint_snapshots_monitor_time", table_name="osint_monitor_snapshots"
    )
    op.drop_table("osint_monitor_snapshots")
    op.drop_index(
        "ix_osint_monitor_checks_monitor_time", table_name="osint_monitor_checks"
    )
    op.drop_table("osint_monitor_checks")
    op.drop_index(
        "ix_osint_monitors_user_enabled", table_name="osint_monitors"
    )
    op.drop_index("ix_osint_monitors_user_id", table_name="osint_monitors")
    op.drop_table("osint_monitors")
