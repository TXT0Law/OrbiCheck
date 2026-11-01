"""Reserve nullable claim metadata for scan-risk notification delivery.

Revision ID: scan_risk_notification_claim
Revises: scan_risk_notification_events
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "scan_risk_notification_claim"
down_revision: Union[str, None] = "scan_risk_notification_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_risk_notification_events",
        sa.Column("claim_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "scan_risk_notification_events",
        sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_constraint(
        "ck_scan_risk_notification_status", "scan_risk_notification_events", type_="check"
    )
    op.create_check_constraint(
        "ck_scan_risk_notification_status",
        "scan_risk_notification_events",
        "status IN ('pending', 'claimed', 'sent', 'cancelled')",
    )
    op.create_check_constraint(
        "ck_scan_risk_notification_claim",
        "scan_risk_notification_events",
        "(status = 'claimed' AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL) "
        "OR (status != 'claimed' AND claim_token IS NULL AND claim_expires_at IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_scan_risk_notification_claim", "scan_risk_notification_events", type_="check"
    )
    op.drop_constraint(
        "ck_scan_risk_notification_status", "scan_risk_notification_events", type_="check"
    )
    # A claimed delivery cannot be resumed by the older schema. Preserve its
    # at-most-once intent by cancelling it instead of making it pending again.
    op.execute(
        sa.text(
            "UPDATE scan_risk_notification_events SET status = 'cancelled' "
            "WHERE status = 'claimed'"
        )
    )
    op.create_check_constraint(
        "ck_scan_risk_notification_status",
        "scan_risk_notification_events",
        "status IN ('pending', 'sent', 'cancelled')",
    )
    op.drop_column("scan_risk_notification_events", "claim_expires_at")
    op.drop_column("scan_risk_notification_events", "claim_token")
