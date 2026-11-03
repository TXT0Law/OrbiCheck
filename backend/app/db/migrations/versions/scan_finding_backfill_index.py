"""Index incomplete finding projections for bounded backfill.

Revision ID: scan_finding_backfill_index
Revises: scan_finding_ruleset_version
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "scan_finding_backfill_index"
down_revision: Union[str, None] = "scan_finding_ruleset_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_scans_finding_backfill",
            "scans",
            ["status", "finding_observations_projected_at", "id"],
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_scans_finding_backfill",
            table_name="scans",
            postgresql_concurrently=True,
        )
