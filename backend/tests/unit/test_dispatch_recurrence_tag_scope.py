"""Phase 2b regression — dispatch_monitor_checks must honor recurrence + tag_scope.

Code-review caught a P0 bug: the dispatcher used to filter
``MaintenanceWindow.starts_at <= now AND ends_at > now`` directly in SQL and
treated every window with ``monitor_id IS NULL`` as "suppress all monitors of
this user". That meant:

1. Recurring windows stopped firing after their original day-1 occurrence
   even though the alert path (which uses
   ``maintenance_window_service.list_active_windows``) kept honoring them.
2. Tag-scoped user-wide windows over-suppressed every monitor regardless of
   tag intersection.

These tests pin the dispatcher to the same ``occurrence_at`` /
``matches_tag_scope`` evaluation as the alert path so the two stay in sync.
We exercise the synchronous helper ``_is_probe_suppressed_sync`` directly
(which is what the Celery task delegates to) — that keeps the regression
coverage focused on the suppression rules and avoids having to spin up the
full Celery + Session machinery.
"""

from __future__ import annotations

import importlib
import sys
import uuid
from datetime import datetime, timezone

import pytest

from app.models.monitor import MaintenanceWindow, Monitor

MODULE_PATH = "app.tasks.monitor_tasks"


def _fresh_module():
    if MODULE_PATH in sys.modules:
        return importlib.reload(sys.modules[MODULE_PATH])
    return importlib.import_module(MODULE_PATH)


def _monitor(
    *,
    user_id: int = 1,
    tags: list[str] | None = None,
) -> Monitor:
    return Monitor(
        id=uuid.uuid4(),
        user_id=user_id,
        url="https://example.com",
        display_name="example",
        is_enabled=True,
        interval_seconds=60,
        tags=tags or [],
    )


def _window(
    *,
    user_id: int = 1,
    monitor_id: uuid.UUID | None = None,
    starts_at: datetime,
    ends_at: datetime,
    suppress_probes: bool = True,
    recurrence: dict | None = None,
    tag_scope: list[str] | None = None,
) -> MaintenanceWindow:
    return MaintenanceWindow(
        id=uuid.uuid4(),
        user_id=user_id,
        monitor_id=monitor_id,
        title="window",
        starts_at=starts_at,
        ends_at=ends_at,
        is_enabled=True,
        suppress_alerts=True,
        suppress_probes=suppress_probes,
        recurrence=recurrence,
        tag_scope=tag_scope,
    )


@pytest.mark.unit
def test_dispatch_helper_suppresses_recurring_window_on_day_two() -> None:
    """Daily recurrence must keep suppressing past day 1.

    Regression: the old SQL filter ``ends_at > now`` would never match a
    daily window whose original ``ends_at`` is yesterday; the recurrence was
    silently ignored by the dispatcher.
    """
    module = _fresh_module()
    starts_at = datetime(2026, 4, 21, 2, 0, tzinfo=timezone.utc)
    ends_at = datetime(2026, 4, 21, 4, 0, tzinfo=timezone.utc)
    window = _window(
        starts_at=starts_at,
        ends_at=ends_at,
        recurrence={"freq": "daily"},
    )
    monitor = _monitor(user_id=window.user_id)
    # Day 2 at 02:30 UTC — past the original ``ends_at`` boundary, inside
    # the daily occurrence.
    now = datetime(2026, 4, 22, 2, 30, tzinfo=timezone.utc)

    assert module._is_probe_suppressed_sync(monitor, [window], now) is True


@pytest.mark.unit
def test_dispatch_helper_does_not_over_suppress_when_tag_scope_misses() -> None:
    """User-wide windows with ``tag_scope`` must not stop untagged monitors.

    Regression: the old loop stuffed every ``monitor_id IS NULL`` row into a
    ``suppressed_user_wide`` set without consulting ``tag_scope``, so a
    "stop only ``prod`` monitors" window also stopped ``staging`` / ``dev``
    monitors owned by the same user.
    """
    module = _fresh_module()
    starts_at = datetime(2026, 4, 22, 0, 0, tzinfo=timezone.utc)
    ends_at = datetime(2026, 4, 23, 0, 0, tzinfo=timezone.utc)
    window = _window(
        starts_at=starts_at, ends_at=ends_at, tag_scope=["prod"]
    )
    prod_monitor = _monitor(user_id=window.user_id, tags=["prod"])
    staging_monitor = _monitor(user_id=window.user_id, tags=["staging"])
    untagged = _monitor(user_id=window.user_id, tags=[])
    now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)

    assert (
        module._is_probe_suppressed_sync(prod_monitor, [window], now) is True
    )
    assert (
        module._is_probe_suppressed_sync(staging_monitor, [window], now)
        is False
    )
    assert (
        module._is_probe_suppressed_sync(untagged, [window], now) is False
    )


@pytest.mark.unit
def test_dispatch_helper_respects_until_at_upper_bound() -> None:
    """``untilAt`` must stop a recurring window from suppressing past its end."""
    module = _fresh_module()
    starts_at = datetime(2026, 4, 21, 2, 0, tzinfo=timezone.utc)
    ends_at = datetime(2026, 4, 21, 4, 0, tzinfo=timezone.utc)
    window = _window(
        starts_at=starts_at,
        ends_at=ends_at,
        recurrence={
            "freq": "daily",
            "untilAt": "2026-04-22T00:00:00+00:00",
        },
    )
    monitor = _monitor(user_id=window.user_id)
    # Day 3 at 02:30 UTC — past ``untilAt``; recurrence inactive.
    now = datetime(2026, 4, 23, 2, 30, tzinfo=timezone.utc)

    assert module._is_probe_suppressed_sync(monitor, [window], now) is False


@pytest.mark.unit
def test_dispatch_helper_weekly_recurrence_only_matches_listed_weekdays() -> None:
    """Weekly + ``byWeekday`` must only suppress on the configured days."""
    module = _fresh_module()
    # 2026-04-20 is a Monday (weekday()==0). Configure the window for
    # Mondays only — Wednesday probes must NOT be suppressed.
    starts_at = datetime(2026, 4, 20, 2, 0, tzinfo=timezone.utc)
    ends_at = datetime(2026, 4, 20, 4, 0, tzinfo=timezone.utc)
    window = _window(
        starts_at=starts_at,
        ends_at=ends_at,
        recurrence={"freq": "weekly", "byWeekday": [0]},
    )
    monitor = _monitor(user_id=window.user_id)

    monday = datetime(2026, 4, 20, 2, 30, tzinfo=timezone.utc)
    wednesday = datetime(2026, 4, 22, 2, 30, tzinfo=timezone.utc)
    assert (
        module._is_probe_suppressed_sync(monitor, [window], monday) is True
    )
    assert (
        module._is_probe_suppressed_sync(monitor, [window], wednesday)
        is False
    )


@pytest.mark.unit
def test_dispatch_helper_short_circuits_when_user_has_no_windows() -> None:
    """``_is_probe_suppressed_sync`` must early-return for windowless users."""
    module = _fresh_module()
    monitor = _monitor()
    now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)
    assert module._is_probe_suppressed_sync(monitor, [], now) is False
    assert module._is_probe_suppressed_sync(monitor, (), now) is False


@pytest.mark.unit
def test_dispatch_helper_ignores_per_monitor_window_for_other_monitors() -> None:
    """Windows scoped to a specific monitor must only affect that monitor."""
    module = _fresh_module()
    starts_at = datetime(2026, 4, 22, 0, 0, tzinfo=timezone.utc)
    ends_at = datetime(2026, 4, 23, 0, 0, tzinfo=timezone.utc)
    target_id = uuid.uuid4()
    window = _window(
        starts_at=starts_at, ends_at=ends_at, monitor_id=target_id
    )
    other = _monitor(user_id=window.user_id)
    # Force the target monitor to share the window's monitor_id so we can
    # assert positive + negative cases on the same fixture.
    target = _monitor(user_id=window.user_id)
    target.id = target_id
    now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)

    assert module._is_probe_suppressed_sync(target, [window], now) is True
    assert module._is_probe_suppressed_sync(other, [window], now) is False
