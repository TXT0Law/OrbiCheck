"""Add visual capture and visual change tables for monitor visual_change capability.

Revision ID: monitor_visual_captures
Revises: ssl_snapshot_and_last_probe
Create Date: 2026-03-25

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "monitor_visual_captures"
down_revision: Union[str, None] = "ssl_snapshot_and_last_probe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osint_monitor_visual_captures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("monitor_id", sa.Uuid(), nullable=False),
        sa.Column("check_id", sa.Uuid(), nullable=True),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("image_png", sa.LargeBinary(), nullable=False),
        sa.Column("width_px", sa.Integer(), nullable=False),
        sa.Column("height_px", sa.Integer(), nullable=False),
        sa.Column("viewport_width", sa.Integer(), nullable=False),
        sa.Column("viewport_height", sa.Integer(), nullable=False),
        sa.Column("full_page", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("perceptual_hash_hex", sa.String(length=32), nullable=True),
        sa.Column("dhash_algo", sa.String(length=16), nullable=False, server_default="dhash"),
        sa.ForeignKeyConstraint(
            ["monitor_id"],
            ["osint_monitors.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["check_id"],
            ["osint_monitor_checks.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_osint_visual_captures_monitor_time",
        "osint_monitor_visual_captures",
        ["monitor_id", "captured_at"],
    )

    op.create_table(
        "osint_monitor_visual_changes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("monitor_id", sa.Uuid(), nullable=False),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("previous_capture_id", sa.Uuid(), nullable=False),
        sa.Column("current_capture_id", sa.Uuid(), nullable=False),
        sa.Column("diff_summary", JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["monitor_id"],
            ["osint_monitors.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["previous_capture_id"],
            ["osint_monitor_visual_captures.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["current_capture_id"],
            ["osint_monitor_visual_captures.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_osint_visual_changes_monitor_detected",
        "osint_monitor_visual_changes",
        ["monitor_id", "detected_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_osint_visual_changes_monitor_detected", table_name="osint_monitor_visual_changes")
    op.drop_table("osint_monitor_visual_changes")
    op.drop_index("ix_osint_visual_captures_monitor_time", table_name="osint_monitor_visual_captures")
    op.drop_table("osint_monitor_visual_captures")
