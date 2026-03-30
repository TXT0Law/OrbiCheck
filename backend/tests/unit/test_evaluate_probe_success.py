"""Unit tests for _evaluate_probe_success (HTTP success gating)."""

from __future__ import annotations

import pytest

from app.services import monitor_service


@pytest.mark.parametrize(
    ("code", "expected", "want"),
    [
        (200, None, True),
        (301, None, True),
        (399, None, True),
        (404, None, False),
        (500, None, False),
        (200, 200, True),
        (301, 200, False),
        (None, None, False),
        (None, 200, False),
    ],
)
def test_evaluate_probe_success(
    code: int | None,
    expected: int | None,
    want: bool,
) -> None:
    assert monitor_service._evaluate_probe_success(code, expected) is want
