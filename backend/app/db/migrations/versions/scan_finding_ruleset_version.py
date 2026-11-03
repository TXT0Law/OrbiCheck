"""Record the ruleset used for zero-finding scan projections.

Existing projections remain unversioned so future notification comparisons
cannot mistake an unknown historical ruleset for a compatible baseline.

Revision ID: scan_finding_ruleset_version
Revises: scan_finding_projection_marker
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "scan_finding_ruleset_version"
down_revision: Union[str, None] = "scan_finding_projection_marker"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scans", sa.Column("finding_ruleset_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("scans", "finding_ruleset_version")
