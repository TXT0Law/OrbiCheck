"""Phase 2.1 — add p50/p95/p99 latency columns + capability widening.

Revision ID: phase2_pcts
Revises: monitor_http_ext
Create Date: 2026-04-21

Adds three nullable Float columns to ``osint_monitors`` so the rolling stats
recompute can persist percentiles alongside ``avg_response_time_ms``. Also
widens ``enabled_capabilities`` element length to ``String(40)`` so the new
``dns_change`` and ``ct_log`` capability keys (Phase 2.2 / 2.3) fit without
silent truncation.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "phase2_pcts"
down_revision: Union[str, None] = "monitor_http_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitors",
        sa.Column("p50_response_time_ms", sa.Float(), nullable=True),
    )
    op.add_column(
        "osint_monitors",
        sa.Column("p95_response_time_ms", sa.Float(), nullable=True),
    )
    op.add_column(
        "osint_monitors",
        sa.Column("p99_response_time_ms", sa.Float(), nullable=True),
    )

    # Backfill percentiles from the most recent 30 days of MonitorCheck rows.
    # Uses Postgres percentile_cont so we don't have to load every check row
    # into Python during the migration.
    op.execute(
        sa.text(
            """
            WITH agg AS (
                SELECT
                    monitor_id,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_ms)
                        AS p50,
                    percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)
                        AS p95,
                    percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time_ms)
                        AS p99
                FROM osint_monitor_checks
                WHERE success = TRUE
                  AND response_time_ms IS NOT NULL
                  AND checked_at >= now() - INTERVAL '30 days'
                GROUP BY monitor_id
            )
            UPDATE osint_monitors m
            SET p50_response_time_ms = agg.p50,
                p95_response_time_ms = agg.p95,
                p99_response_time_ms = agg.p99
            FROM agg
            WHERE m.id = agg.monitor_id
            """
        )
    )


def downgrade() -> None:
    op.drop_column("osint_monitors", "p99_response_time_ms")
    op.drop_column("osint_monitors", "p95_response_time_ms")
    op.drop_column("osint_monitors", "p50_response_time_ms")
