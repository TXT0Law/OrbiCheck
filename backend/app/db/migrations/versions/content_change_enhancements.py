"""Content change: snapshot metadata, change hashes, retention FKs, indexes.

Revision ID: content_change_enhancements
Revises: add_monitor_uptime_fields
Create Date: 2026-03-24

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "content_change_enhancements"
down_revision: Union[str, None] = "add_monitor_uptime_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_snapshot_fks_on_changes() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    fks = insp.get_foreign_keys("osint_monitor_changes")
    for fk in fks:
        rt = fk.get("referred_table")
        if rt == "osint_monitor_snapshots":
            op.drop_constraint(fk["name"], "osint_monitor_changes", type_="foreignkey")


def upgrade() -> None:
    op.add_column(
        "osint_monitor_snapshots",
        sa.Column("content_type", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "osint_monitor_snapshots",
        sa.Column("charset", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "osint_monitor_snapshots",
        sa.Column("http_status_code", sa.Integer(), nullable=True),
    )
    op.add_column(
        "osint_monitor_snapshots",
        sa.Column(
            "is_baseline",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("osint_monitor_snapshots", "is_baseline", server_default=None)

    op.add_column(
        "osint_monitors",
        sa.Column(
            "total_changes_detected",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column("osint_monitors", "total_changes_detected", server_default=None)

    op.add_column(
        "osint_monitor_changes",
        sa.Column("change_size_bytes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("osint_monitor_changes", "change_size_bytes", server_default=None)
    op.add_column(
        "osint_monitor_changes",
        sa.Column("previous_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "osint_monitor_changes",
        sa.Column("current_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "osint_monitor_changes",
        sa.Column(
            "threshold_met",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("osint_monitor_changes", "threshold_met", server_default=None)

    _drop_snapshot_fks_on_changes()
    op.alter_column(
        "osint_monitor_changes",
        "previous_snapshot_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.alter_column(
        "osint_monitor_changes",
        "current_snapshot_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.create_foreign_key(
        "osint_monitor_changes_previous_snapshot_id_fkey",
        "osint_monitor_changes",
        "osint_monitor_snapshots",
        ["previous_snapshot_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "osint_monitor_changes_current_snapshot_id_fkey",
        "osint_monitor_changes",
        "osint_monitor_snapshots",
        ["current_snapshot_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_osint_changes_monitor_detected",
        "osint_monitor_changes",
        ["monitor_id", "detected_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_osint_changes_monitor_detected", table_name="osint_monitor_changes")
    _drop_snapshot_fks_on_changes()
    op.alter_column(
        "osint_monitor_changes",
        "previous_snapshot_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.alter_column(
        "osint_monitor_changes",
        "current_snapshot_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.create_foreign_key(
        "osint_monitor_changes_previous_snapshot_id_fkey",
        "osint_monitor_changes",
        "osint_monitor_snapshots",
        ["previous_snapshot_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "osint_monitor_changes_current_snapshot_id_fkey",
        "osint_monitor_changes",
        "osint_monitor_snapshots",
        ["current_snapshot_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_column("osint_monitor_changes", "threshold_met")
    op.drop_column("osint_monitor_changes", "current_hash")
    op.drop_column("osint_monitor_changes", "previous_hash")
    op.drop_column("osint_monitor_changes", "change_size_bytes")
    op.drop_column("osint_monitors", "total_changes_detected")
    op.drop_column("osint_monitor_snapshots", "is_baseline")
    op.drop_column("osint_monitor_snapshots", "http_status_code")
    op.drop_column("osint_monitor_snapshots", "charset")
    op.drop_column("osint_monitor_snapshots", "content_type")
