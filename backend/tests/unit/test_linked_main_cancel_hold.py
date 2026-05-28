import pytest

from app.test_linked_main import (
    DeterministicScanDispatcher,
    LINKED_CANCEL_HOLD_SECONDS,
    LINKED_CANCEL_HOLD_URL,
    _should_hold_for_cancel,
)

pytestmark = pytest.mark.unit


def test_linked_cancel_hold_target_is_explicit() -> None:
    assert LINKED_CANCEL_HOLD_URL == "https://iana.org/orbicheck-cancel-hold"
    assert LINKED_CANCEL_HOLD_SECONDS > 0


def test_should_hold_for_cancel_only_matches_smoke_target() -> None:
    assert _should_hold_for_cancel(LINKED_CANCEL_HOLD_URL)
    assert not _should_hold_for_cancel("https://iana.org")
    assert not _should_hold_for_cancel("https://example.com")


def test_deterministic_dispatcher_keeps_celery_task_shape() -> None:
    dispatcher = DeterministicScanDispatcher()

    assert callable(dispatcher.delay)
    assert callable(dispatcher.run)
