"""osint_monitors: check_type -> capabilities JSONB + enabled_capabilities; checks evaluated_capabilities.

Revision ID: monitor_multi_capability
Revises: add_osint_monitors
Create Date: 2026-03-24

"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "monitor_multi_capability"
down_revision: Union[str, None] = "add_osint_monitors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("osint_monitors", sa.Column("capabilities", JSONB, nullable=True))
    op.add_column("osint_monitors", sa.Column("enabled_capabilities", ARRAY(sa.String(32)), nullable=True))
    op.add_column(
        "osint_monitor_checks",
        sa.Column(
            "evaluated_capabilities",
            ARRAY(sa.String(32)),
            nullable=False,
            server_default="{}",
        ),
    )

    conn = op.get_bind()
    from app.core.monitor_defaults import capabilities_from_legacy_check_type

    rows = conn.execute(text("SELECT id, check_type FROM osint_monitors")).fetchall()
    for row in rows:
        rid = row[0]
        ct = str(row[1]).strip().lower().replace("-", "_")
        caps = capabilities_from_legacy_check_type(ct)
        # check_type was an application enum; normalize to snake_case for ARRAY + JSON.
        conn.execute(
            text(
                f"UPDATE osint_monitors SET capabilities = CAST(:caps AS jsonb), "
                f"enabled_capabilities = ARRAY['{ct}']::varchar(32)[] WHERE id = :id"
            ),
            {"caps": json.dumps(caps), "id": rid},
        )

    op.alter_column("osint_monitors", "capabilities", nullable=False)
    op.alter_column("osint_monitors", "enabled_capabilities", nullable=False)
    op.drop_column("osint_monitors", "check_type")


def downgrade() -> None:
    op.add_column(
        "osint_monitors",
        sa.Column("check_type", sa.String(length=32), nullable=True),
    )
    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, enabled_capabilities FROM osint_monitors")).fetchall()
    for row in rows:
        rid = row[0]
        en = row[1] or []
        ct = en[0] if len(en) > 0 else "uptime_only"
        conn.execute(
            text("UPDATE osint_monitors SET check_type = :ct WHERE id = :id"),
            {"ct": ct, "id": rid},
        )
    op.alter_column("osint_monitors", "check_type", nullable=False)
    op.drop_column("osint_monitors", "capabilities")
    op.drop_column("osint_monitors", "enabled_capabilities")
    op.drop_column("osint_monitor_checks", "evaluated_capabilities")
