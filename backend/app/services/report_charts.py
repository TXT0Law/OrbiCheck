"""Pure chart-rendering helpers for the offline PDF report.

Each public function here takes already-aggregated data and returns PNG bytes
suitable for ``fpdf.FPDF.image(BytesIO(data), ...)``. Charts mirror the live
Web summary palette so the offline PDF / HTML and the dashboard look like the
same product (see ``middleReport.md`` T3.2 / Phase 3).

Design rules
------------
* matplotlib is forced onto the headless ``Agg`` backend at import time so this
  module is safe to call from any worker / CLI / test process.
* Functions are pure: no DB, no logging side effects, no global state.
* Callers MUST treat any exception as fatal **for the chart only** — the PDF
  rendering pipeline catches ``Exception`` and falls back to text so a broken
  chart does not block report delivery (see ``report_service.render_pdf``).
* Colors are kept in lock-step with ``components/scan/charts/*`` Tailwind
  palette: critical red-600, high orange-600, medium yellow-600, low blue-600.
  Update both sides together when the palette changes.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from io import BytesIO

import matplotlib

matplotlib.use("Agg")

# Imports below MUST come after ``matplotlib.use("Agg")`` to avoid pulling in
# a GUI backend on first import.
import matplotlib.pyplot as plt  # noqa: E402

__all__ = [
    "render_module_duration_bar",
    "render_score_radar",
    "render_severity_donut",
]

# Tailwind palette mapped to severity buckets. Mirrors ``components/scan/charts``
# (e.g. ``severity-distribution-chart.tsx``) so PDF and Web tell the same story.
SEVERITY_COLORS: dict[str, str] = {
    "critical": "#DC2626",  # red-600
    "high": "#EA580C",      # orange-600
    "medium": "#CA8A04",    # yellow-600
    "low": "#2563EB",       # blue-600
}

# Stable severity ordering used by all charts.
SEVERITY_ORDER: tuple[str, ...] = ("critical", "high", "medium", "low")

# 5-axis category labels for the score breakdown radar.
RADAR_CATEGORY_ORDER: tuple[tuple[str, str], ...] = (
    ("transport", "Transport"),
    ("httpSecurity", "HTTP Security"),
    ("threatIntel", "Threat Intel"),
    ("infrastructure", "Infrastructure"),
    ("bestPractices", "Best Practices"),
)

# Maximum score expected per radar axis (matches ``security_analyzer`` weights).
RADAR_MAX_SCORE = 30.0

# Maximum bars in the duration chart; matches the Web ``module-duration-chart``.
MODULE_DURATION_BAR_LIMIT = 10

# Default fallback color for non-severity bars.
NEUTRAL_COLOR = "#475569"  # slate-600


def _figure_to_png(fig: "matplotlib.figure.Figure", *, dpi: int = 144) -> bytes:
    buffer = BytesIO()
    fig.savefig(buffer, format="png", dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return buffer.getvalue()


def _coerce_int(value: object) -> int:
    try:
        result = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return max(result, 0)


def _coerce_float(value: object) -> float:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(result, 0.0)


def render_severity_donut(severity: dict | None) -> bytes:
    """Render a 4-slice donut for critical/high/medium/low counts.

    Empty buckets are still drawn so the legend stays comparable across reports;
    when **all** counts are zero a placeholder grey ring is rendered.
    """
    severity = severity or {}
    raw_values = [_coerce_int(severity.get(level, 0)) for level in SEVERITY_ORDER]
    colors = [SEVERITY_COLORS[level] for level in SEVERITY_ORDER]
    labels = [
        f"{level.capitalize()} ({raw_values[idx]})"
        for idx, level in enumerate(SEVERITY_ORDER)
    ]

    fig, ax = plt.subplots(figsize=(4.5, 3.0))
    total = sum(raw_values)
    if total == 0:
        ax.pie(
            [1],
            colors=["#E5E7EB"],
            wedgeprops={"width": 0.35, "edgecolor": "white"},
            startangle=90,
        )
        ax.text(0, 0, "No findings", ha="center", va="center", fontsize=11, color="#374151")
    else:
        wedges, _ = ax.pie(
            raw_values,
            colors=colors,
            wedgeprops={"width": 0.35, "edgecolor": "white"},
            startangle=90,
        )
        ax.text(
            0,
            0,
            f"{total}\nfindings",
            ha="center",
            va="center",
            fontsize=12,
            color="#111827",
            fontweight="bold",
        )
        ax.legend(
            wedges,
            labels,
            loc="center left",
            bbox_to_anchor=(1.02, 0.5),
            frameon=False,
            fontsize=9,
        )

    ax.set_aspect("equal")
    ax.set_title("Severity Distribution", fontsize=12, color="#111827", pad=10)
    return _figure_to_png(fig)


def render_score_radar(category_scores: dict | None) -> bytes:
    """Render a 5-axis radar from camelCase ``categoryScores``.

    Missing keys default to 0 so the polygon always closes; shape mirrors the
    Web ``score-breakdown-radar.tsx`` component.
    """
    import math

    scores = category_scores or {}
    values = [_coerce_float(scores.get(key, 0.0)) for key, _ in RADAR_CATEGORY_ORDER]
    labels = [label for _, label in RADAR_CATEGORY_ORDER]
    n_axes = len(RADAR_CATEGORY_ORDER)
    angles = [n / float(n_axes) * 2 * math.pi for n in range(n_axes)]
    closed_values = values + values[:1]
    closed_angles = angles + angles[:1]

    fig, ax = plt.subplots(figsize=(4.5, 3.5), subplot_kw={"polar": True})
    ax.set_theta_offset(math.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_thetagrids([math.degrees(a) for a in angles], labels, fontsize=8)
    ax.set_ylim(0, RADAR_MAX_SCORE)
    ax.set_yticks([RADAR_MAX_SCORE / 3, 2 * RADAR_MAX_SCORE / 3, RADAR_MAX_SCORE])
    ax.set_yticklabels([
        f"{int(RADAR_MAX_SCORE / 3)}",
        f"{int(2 * RADAR_MAX_SCORE / 3)}",
        f"{int(RADAR_MAX_SCORE)}",
    ], fontsize=7, color="#6B7280")
    ax.tick_params(pad=4)
    ax.plot(closed_angles, closed_values, color="#2563EB", linewidth=2)
    ax.fill(closed_angles, closed_values, color="#2563EB", alpha=0.25)
    ax.set_title("Score Breakdown", fontsize=12, color="#111827", pad=12)
    ax.grid(color="#E5E7EB", linestyle="--", linewidth=0.6)
    return _figure_to_png(fig)


def _module_color(status: object) -> str:
    """Map a module status to a Tailwind-aligned bar color."""
    text = str(status or "").lower()
    if text in {"failed", "timeout", "timed_out"}:
        return SEVERITY_COLORS["critical"]
    if text in {"skipped", "pending", "running"}:
        return SEVERITY_COLORS["medium"]
    return SEVERITY_COLORS["low"]


def render_module_duration_bar(
    modules: Sequence[dict] | Iterable[dict] | None,
    *,
    limit: int = MODULE_DURATION_BAR_LIMIT,
) -> bytes:
    """Render a horizontal bar of the slowest modules (descending duration)."""
    items = [item for item in (modules or []) if isinstance(item, dict)]
    sortable = [
        (
            str(item.get("module") or "unknown"),
            _coerce_int(item.get("duration") or item.get("durationMs") or 0),
            item.get("status"),
        )
        for item in items
    ]
    sortable.sort(key=lambda triple: triple[1], reverse=True)
    sortable = sortable[:limit]

    fig, ax = plt.subplots(figsize=(5.5, max(2.0, 0.35 * max(len(sortable), 1) + 0.6)))
    if not sortable:
        ax.text(0.5, 0.5, "No module timing data", ha="center", va="center", fontsize=11, color="#6B7280")
        ax.axis("off")
        return _figure_to_png(fig)

    names = [name for name, _, _ in sortable]
    durations = [duration for _, duration, _ in sortable]
    colors = [_module_color(status) for _, _, status in sortable]
    y_positions = list(range(len(sortable)))

    ax.barh(y_positions, durations, color=colors, edgecolor="white")
    ax.set_yticks(y_positions)
    ax.set_yticklabels(names, fontsize=8, color="#111827")
    ax.invert_yaxis()
    ax.set_xlabel("Duration (ms)", fontsize=9, color="#374151")
    ax.set_title("Module Execution Duration", fontsize=12, color="#111827", pad=10)
    ax.grid(axis="x", color="#E5E7EB", linestyle="--", linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for index, duration in enumerate(durations):
        ax.text(
            duration,
            index,
            f"  {duration}ms",
            va="center",
            ha="left",
            fontsize=7,
            color="#374151",
        )

    return _figure_to_png(fig)
