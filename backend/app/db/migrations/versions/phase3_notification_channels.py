"""Phase 3 — notification dispatch log + retry queue persistence.

Revision ID: phase3_notif
Revises: phase2b_maint
Create Date: 2026-04-28

The Phase 3 channel adapter framework (Slack/Discord/Teams/PagerDuty in
addition to the existing webhook + email channels) needs durable per-attempt
state so failed deliveries can be retried by a Celery task. This migration
introduces the ``osint_notification_dispatch_log`` table:

* one row per channel attempt (``status`` advances ``pending → succeeded |
  failed | dead``) so we can render an audit trail in the dashboard;
* ``next_attempt_at`` lets the retry task pick up only rows that are due,
  bounded by ``attempts < max_attempts``;
* the row is keyed back to the originating ``alert_event_id`` (nullable —
  tests / synthetic ``POST /notifications/test`` calls may dispatch without
  an alert event) so the UI can join channel attempts onto the alert
  history.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "phase3_notif"
down_revision: Union[str, None] = "phase2b_maint"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osint_notification_dispatch_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "monitor_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "alert_event_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column("channel_id", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("dedup_key", sa.String(length=200), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "max_attempts", sa.Integer(), nullable=False, server_default=sa.text("5")
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "succeeded_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["monitor_id"], ["osint_monitors.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["alert_event_id"], ["osint_alert_events.id"], ondelete="SET NULL"
        ),
    )
    op.create_index(
        "ix_osint_notif_dispatch_log_user_created",
        "osint_notification_dispatch_log",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_osint_notif_dispatch_log_pending",
        "osint_notification_dispatch_log",
        ["status", "next_attempt_at"],
    )
    op.create_index(
        "ix_osint_notif_dispatch_log_dedup",
        "osint_notification_dispatch_log",
        ["channel_id", "dedup_key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_osint_notif_dispatch_log_dedup",
        table_name="osint_notification_dispatch_log",
    )
    op.drop_index(
        "ix_osint_notif_dispatch_log_pending",
        table_name="osint_notification_dispatch_log",
    )
    op.drop_index(
        "ix_osint_notif_dispatch_log_user_created",
        table_name="osint_notification_dispatch_log",
    )
    op.drop_table("osint_notification_dispatch_log")
