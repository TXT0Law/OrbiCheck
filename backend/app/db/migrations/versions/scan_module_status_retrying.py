"""Add RETRYING value to the scan module status enum (S-10).

Revision ID: scan_module_status_retrying
Revises: visual_capture_diagnostic
Create Date: 2026-05-12

S-10: previously when a single batch HTTP call to the scan-service failed
(connection error, 5xx, MODULE_TIMEOUT_MS), every module that did not yet
have a result was marked ``FAILED`` instantly. The orchestrator now
re-executes those modules one-by-one before declaring final failure, and
flags them ``RETRYING`` while the retry is pending. This migration adds
the new value to the existing PostgreSQL enum type so existing rows stay
valid.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "scan_module_status_retrying"
down_revision: Union[str, None] = "visual_capture_diagnostic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres enum types are immutable; values can only be appended via
    # ALTER TYPE ... ADD VALUE. Use IF NOT EXISTS so a re-run during local
    # iteration does not fail.
    op.execute("ALTER TYPE modulestatus ADD VALUE IF NOT EXISTS 'retrying'")


def downgrade() -> None:
    # Postgres has no native "drop enum value" operation. Downgrades that
    # actually need to remove the value must rebuild the enum type. We
    # leave a no-op here because the value is additive and harmless when
    # left in place after a rollback of the application code.
    pass
