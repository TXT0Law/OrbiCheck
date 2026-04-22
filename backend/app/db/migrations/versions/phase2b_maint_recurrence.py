"""Phase 2b — maintenance window recurrence + tag scope.

Revision ID: phase2b_maint
Revises: phase2_dnsmw
Create Date: 2026-04-22

Adds two nullable columns to ``osint_maintenance_windows``:

* ``recurrence`` (JSONB) — RRULE-lite specification ``{"freq": "weekly"|"daily",
  "byWeekday": [0..6], "untilAt": "<iso ts>"}`` — ``None`` keeps the legacy
  one-shot behavior. Validation is done at the API boundary; storage stays
  permissive so future expansion (e.g. monthly) does not need another
  migration.
* ``tag_scope`` (TEXT[]) — when non-empty, the window only matches monitors
  whose ``tags`` contain at least one of the listed values. ``None``/empty
  keeps the legacy "all monitors of this user" semantics.

Both columns are nullable and default ``NULL`` so the migration is reversible
without data loss.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "phase2b_maint"
down_revision: Union[str, None] = "phase2_dnsmw"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_maintenance_windows",
        sa.Column(
            "recurrence",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "osint_maintenance_windows",
        sa.Column(
            "tag_scope",
            postgresql.ARRAY(sa.String(length=50)),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("osint_maintenance_windows", "tag_scope")
    op.drop_column("osint_maintenance_windows", "recurrence")
