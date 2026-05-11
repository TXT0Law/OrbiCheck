"""Add is_diagnostic to monitor visual captures (V-1).

Revision ID: visual_capture_diagnostic
Revises: report_html_export
Create Date: 2026-05-11

The visual_change capability previously only saved a capture when the
HTTP probe succeeded, which meant operators never saw what the target
looked like during a Cloudflare interstitial, 5xx storm, or TLS error.
We now also store screenshots from failed probes, flagged with
``is_diagnostic = True`` so dHash similarity comparison ignores them
and the UI can render them with a degraded badge.

The migration is backward-compatible: existing rows default to ``False``
because they correspond to successful probes.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "visual_capture_diagnostic"
down_revision: Union[str, None] = "report_html_export"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitor_visual_captures",
        sa.Column(
            "is_diagnostic",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_osint_visual_captures_monitor_diagnostic",
        "osint_monitor_visual_captures",
        ["monitor_id", "is_diagnostic"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_osint_visual_captures_monitor_diagnostic",
        table_name="osint_monitor_visual_captures",
    )
    op.drop_column("osint_monitor_visual_captures", "is_diagnostic")
