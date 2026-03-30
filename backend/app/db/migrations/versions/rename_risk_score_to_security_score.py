"""Rename scans.risk_score to security_score.

Revision ID: rename_risk_to_security_score
Revises: alert_events_feed
Create Date: 2026-03-26
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "rename_risk_to_security_score"
down_revision: Union[str, None] = "alert_events_feed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('ALTER TABLE scans RENAME COLUMN risk_score TO security_score')


def downgrade() -> None:
    op.execute('ALTER TABLE scans RENAME COLUMN security_score TO risk_score')
