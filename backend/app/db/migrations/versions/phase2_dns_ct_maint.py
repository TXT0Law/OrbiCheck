"""Phase 2.2 / 2.3 / 2.4 — DNS history, CT log entries, maintenance windows.

Revision ID: phase2_dnsmw
Revises: phase2_pcts
Create Date: 2026-04-21

Adds three new tables (``osint_monitor_dns_records``,
``osint_monitor_dns_changes``, ``osint_monitor_ct_entries``) plus the
``osint_maintenance_windows`` table used by the suppression service. None of
these reference existing columns, so the migration is reversible cleanly.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "phase2_dnsmw"
down_revision: Union[str, None] = "phase2_pcts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osint_monitor_dns_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("record_type", sa.String(length=8), nullable=False),
        sa.Column("values", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "observed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("last_change_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_osint_dns_records_monitor_type",
        "osint_monitor_dns_records",
        ["monitor_id", "record_type"],
        unique=True,
    )

    op.create_table(
        "osint_monitor_dns_changes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("record_type", sa.String(length=8), nullable=False),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "previous_values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "current_values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "added_values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "removed_values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_osint_dns_changes_monitor_detected",
        "osint_monitor_dns_changes",
        ["monitor_id", "detected_at"],
    )

    op.create_table(
        "osint_monitor_ct_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hostname", sa.String(length=253), nullable=False),
        sa.Column("serial_number", sa.String(length=80), nullable=False),
        sa.Column("leaf_sha256", sa.String(length=64), nullable=True),
        sa.Column("issuer_name", sa.String(length=255), nullable=True),
        sa.Column("common_name", sa.String(length=255), nullable=True),
        sa.Column("not_before", sa.DateTime(timezone=True), nullable=True),
        sa.Column("not_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "observed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("crtsh_id", sa.String(length=64), nullable=True),
        sa.Column(
            "pin_violation",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("alerted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_osint_ct_entries_monitor_serial",
        "osint_monitor_ct_entries",
        ["monitor_id", "serial_number"],
        unique=True,
    )
    op.create_index(
        "ix_osint_ct_entries_observed",
        "osint_monitor_ct_entries",
        ["monitor_id", "observed_at"],
    )

    op.create_table(
        "osint_maintenance_windows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "suppress_alerts",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "suppress_probes",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_osint_maintenance_windows_user_id",
        "osint_maintenance_windows",
        ["user_id"],
    )
    op.create_index(
        "ix_osint_maint_windows_active",
        "osint_maintenance_windows",
        ["user_id", "is_enabled", "starts_at", "ends_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_osint_maint_windows_active", table_name="osint_maintenance_windows"
    )
    op.drop_index(
        "ix_osint_maintenance_windows_user_id",
        table_name="osint_maintenance_windows",
    )
    op.drop_table("osint_maintenance_windows")

    op.drop_index(
        "ix_osint_ct_entries_observed", table_name="osint_monitor_ct_entries"
    )
    op.drop_index(
        "ix_osint_ct_entries_monitor_serial",
        table_name="osint_monitor_ct_entries",
    )
    op.drop_table("osint_monitor_ct_entries")

    op.drop_index(
        "ix_osint_dns_changes_monitor_detected",
        table_name="osint_monitor_dns_changes",
    )
    op.drop_table("osint_monitor_dns_changes")

    op.drop_index(
        "ix_osint_dns_records_monitor_type",
        table_name="osint_monitor_dns_records",
    )
    op.drop_table("osint_monitor_dns_records")
