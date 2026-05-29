"""Add URL group batch run tables.

Revision ID: add_url_group_runs
Revises: scan_module_status_retrying
Create Date: 2026-05-28
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "add_url_group_runs"
down_revision: Union[str, None] = "scan_module_status_retrying"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "url_group_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "running",
                "completed",
                "failed",
                "cancelled",
                "partial",
                name="urlgrouprunstatus",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("total_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("queued_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("running_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cancelled_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("concurrency_limit", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["url_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_url_group_runs_group_id", "url_group_runs", ["group_id"])
    op.create_index("ix_url_group_runs_user_id", "url_group_runs", ["user_id"])
    op.create_index("ix_url_group_runs_status", "url_group_runs", ["status"])

    op.create_table(
        "url_group_run_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_member_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "creating_scan",
                "running",
                "completed",
                "failed",
                "cancelled",
                "skipped",
                name="urlgrouprunmemberstatus",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["group_member_id"], ["url_group_members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["url_group_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_url_group_run_members_run_id", "url_group_run_members", ["run_id"])
    op.create_index(
        "ix_url_group_run_members_group_member_id",
        "url_group_run_members",
        ["group_member_id"],
    )
    op.create_index("ix_url_group_run_members_scan_id", "url_group_run_members", ["scan_id"])
    op.create_index("ix_url_group_run_members_status", "url_group_run_members", ["status"])


def downgrade() -> None:
    op.drop_index("ix_url_group_run_members_status", table_name="url_group_run_members")
    op.drop_index("ix_url_group_run_members_scan_id", table_name="url_group_run_members")
    op.drop_index(
        "ix_url_group_run_members_group_member_id",
        table_name="url_group_run_members",
    )
    op.drop_index("ix_url_group_run_members_run_id", table_name="url_group_run_members")
    op.drop_table("url_group_run_members")
    op.drop_index("ix_url_group_runs_status", table_name="url_group_runs")
    op.drop_index("ix_url_group_runs_user_id", table_name="url_group_runs")
    op.drop_index("ix_url_group_runs_group_id", table_name="url_group_runs")
    op.drop_table("url_group_runs")
