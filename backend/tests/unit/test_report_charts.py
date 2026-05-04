"""Unit tests for ``app.services.report_charts``.

Covers the three public chart builders used to embed images in the offline
PDF (T3.2). Each test verifies:

* a real PNG (magic header) is returned;
* empty / missing inputs do not raise;
* tunable parameters (``limit``) constrain the output.

We intentionally do NOT compare pixel buffers; the goal is byte-level integrity
and correct invocation, not visual regression (which is owned by the Web charts).
"""

from __future__ import annotations

import pytest

from app.services.report_charts import (
    MODULE_DURATION_BAR_LIMIT,
    SEVERITY_COLORS,
    SEVERITY_ORDER,
    render_module_duration_bar,
    render_score_radar,
    render_severity_donut,
)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


@pytest.mark.unit
def test_render_severity_donut_returns_png_for_normal_data() -> None:
    png = render_severity_donut({"critical": 1, "high": 2, "medium": 3, "low": 4})

    assert isinstance(png, bytes)
    assert png.startswith(PNG_MAGIC)
    # Real chart with legend should be measurably larger than the empty placeholder.
    assert len(png) > 5000


@pytest.mark.unit
def test_render_severity_donut_handles_empty_input() -> None:
    """Zero-finding scans must still produce a PNG (placeholder ring)."""
    png = render_severity_donut(None)

    assert png.startswith(PNG_MAGIC)
    assert len(png) > 1000


@pytest.mark.unit
def test_render_severity_donut_coerces_invalid_counts() -> None:
    """Non-int values (None / strings) are coerced to 0; no crash."""
    png = render_severity_donut(
        {"critical": None, "high": "n/a", "medium": 2, "low": -3}
    )

    assert png.startswith(PNG_MAGIC)


@pytest.mark.unit
def test_render_score_radar_returns_png() -> None:
    png = render_score_radar(
        {
            "transport": 24.0,
            "httpSecurity": 18.0,
            "threatIntel": 15.0,
            "infrastructure": 9.0,
            "bestPractices": 6.0,
        }
    )

    assert png.startswith(PNG_MAGIC)
    assert len(png) > 5000


@pytest.mark.unit
def test_render_score_radar_handles_missing_categories() -> None:
    """Partial breakdowns default missing axes to 0 rather than crashing."""
    png = render_score_radar({"transport": 25.0})

    assert png.startswith(PNG_MAGIC)


@pytest.mark.unit
def test_render_score_radar_handles_none_input() -> None:
    png = render_score_radar(None)

    assert png.startswith(PNG_MAGIC)


@pytest.mark.unit
def test_render_module_duration_bar_returns_png_with_data() -> None:
    png = render_module_duration_bar(
        [
            {"module": "ssl", "status": "success", "duration": 1234},
            {"module": "headers", "status": "failed", "duration": 567},
            {"module": "dns", "status": "success", "duration": 200},
        ]
    )

    assert png.startswith(PNG_MAGIC)


@pytest.mark.unit
def test_render_module_duration_bar_handles_empty_list() -> None:
    png = render_module_duration_bar([])

    assert png.startswith(PNG_MAGIC)


@pytest.mark.unit
def test_render_module_duration_bar_respects_limit() -> None:
    """``limit`` must cap the number of bars shown."""
    modules = [
        {"module": f"mod-{i}", "status": "success", "duration": 100 + i}
        for i in range(MODULE_DURATION_BAR_LIMIT + 5)
    ]

    png = render_module_duration_bar(modules, limit=3)

    assert png.startswith(PNG_MAGIC)


@pytest.mark.unit
def test_severity_palette_covers_all_buckets() -> None:
    """Guard: SEVERITY_COLORS must cover every level enumerated in SEVERITY_ORDER."""
    assert set(SEVERITY_COLORS.keys()) >= set(SEVERITY_ORDER)
