"""Add an episode-deduplicated queue for high-risk scan notifications.

Revision ID: scan_risk_notification_events
Revises: scan_finding_ruleset_version
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "scan_risk_notification_events"
down_revision: Union[str, None] = "scan_finding_ruleset_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_risk_notification_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scan_completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("baseline_scan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("baseline_completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rule_id", sa.String(length=96), nullable=False),
        sa.Column("ruleset_version", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("ruleset_version > 0", name="ck_scan_risk_notification_ruleset_version"),
        sa.CheckConstraint("kind IN ('new', 'regressed')", name="ck_scan_risk_notification_kind"),
        sa.CheckConstraint(
            "status IN ('pending', 'sent', 'cancelled')",
            name="ck_scan_risk_notification_status",
        ),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "baseline_scan_id",
            "baseline_completed_at",
            "rule_id",
            "ruleset_version",
            name="uq_scan_risk_notification_episode",
        ),
    )
    op.create_index(
        "ix_scan_risk_notification_status_created",
        "scan_risk_notification_events",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_scan_risk_notification_status_created",
        table_name="scan_risk_notification_events",
    )
    op.drop_table("scan_risk_notification_events")
