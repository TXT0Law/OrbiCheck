"""Create alert events table for monitor alert history.

Revision ID: alert_events_feed
Revises: mon_ch_notify_disp
Create Date: 2026-03-26
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "alert_events_feed"
down_revision: Union[str, None] = "mon_ch_notify_disp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osint_alert_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "monitor_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("capability", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("threshold_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("actual_value", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "dispatched_channels",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "suppressed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("suppress_reason", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["monitor_id"],
            ["osint_monitors.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_osint_alert_events_monitor_created",
        "osint_alert_events",
        ["monitor_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_osint_alert_events_monitor_cap_created",
        "osint_alert_events",
        ["monitor_id", "capability", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_osint_alert_events_monitor_cap_created", table_name="osint_alert_events")
    op.drop_index("ix_osint_alert_events_monitor_created", table_name="osint_alert_events")
    op.drop_table("osint_alert_events")
