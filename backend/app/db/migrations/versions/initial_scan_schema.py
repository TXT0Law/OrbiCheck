"""Create the initial scan tables.

Revision ID: initial_scan_schema
Revises:
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "initial_scan_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCAN_STATUS = sa.Enum(
    "PENDING",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    name="scanstatus",
)
MODULE_STATUS = sa.Enum(
    "PENDING",
    "RUNNING",
    "SUCCESS",
    "FAILED",
    "TIMEOUT",
    name="modulestatus",
)


def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("status", SCAN_STATUS, nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("total_modules", sa.Integer(), nullable=False),
        sa.Column("completed_modules", sa.Integer(), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "scan_module_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "scan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_name", sa.String(length=50), nullable=False),
        sa.Column("status", MODULE_STATUS, nullable=False),
        sa.Column("raw_result", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("scan_module_results")
    op.drop_table("scans")
    MODULE_STATUS.drop(op.get_bind(), checkfirst=True)
    SCAN_STATUS.drop(op.get_bind(), checkfirst=True)
