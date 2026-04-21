"""Add http_body / http_headers / http_auth columns to monitors (1.1).

Revision ID: monitor_http_ext (must fit alembic_version.version_num VARCHAR(32))
Revises: add_scan_options_to_scans
Create Date: 2026-04-21

Phase 1.1 schema for per-monitor HTTP request extensions:
    * ``http_body`` TEXT NULL — UTF-8 body bytes for POST/PUT/PATCH probes.
    * ``http_headers`` JSONB NULL — dict[str, str] of additional headers.
    * ``http_auth`` JSONB NULL — encrypted envelope
      ``{"scheme": "bearer"|"basic", "token_ciphertext": "<fernet>"}``.

All three columns are NULLABLE; existing monitors keep their behavior.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "monitor_http_ext"
down_revision: Union[str, None] = "add_scan_options_to_scans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitors",
        sa.Column("http_body", sa.Text(), nullable=True),
    )
    op.add_column(
        "osint_monitors",
        sa.Column(
            "http_headers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "osint_monitors",
        sa.Column(
            "http_auth",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("osint_monitors", "http_auth")
    op.drop_column("osint_monitors", "http_headers")
    op.drop_column("osint_monitors", "http_body")
