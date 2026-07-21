"""Helpers for synthetic notification-channel test dispatches."""

from __future__ import annotations

import uuid

from app.models.monitor import Monitor


def build_synthetic_monitor(monitor_id: uuid.UUID, user_id: int) -> Monitor:
    """Build a detached monitor that is never persisted."""
    return Monitor(
        id=monitor_id,
        user_id=user_id,
        display_name="OrbiCheck test monitor",
        url="https://example.com",
        tags=[],
        capabilities={},
        enabled_capabilities=[],
    )
