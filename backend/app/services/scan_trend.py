"""Same-domain timeline + scan-to-scan diff helpers.

Phase 5 (T5.1 / T5.2) of ``prompt_dev/middleReport.md``: lets the dashboard
draw historical trends for a domain and show what changed between two scans
without inventing new persistence — the timeline is derived from the
existing ``scans`` table and the diff is computed at request time from the
already-stored ``module_results``.

These helpers keep the route handlers thin (per ``backend/AGENTS.md``: thin
endpoints / business logic in ``services/``) and stay pure / DB-agnostic
for ``compute_*_diff``.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scan import ModuleStatus, Scan, ScanStatus
from app.services.security_analyzer import (
    compute_security_score_v2,
    compute_severity_counts,
    extract_key_findings,
)


# ─── Constants ──────────────────────────────────────────────────────────

# Default cap for the timeline list. Keeps response payloads small and
# dashboard charts readable; clients can request a different ``limit``.
DEFAULT_TIMELINE_LIMIT = 10

# Hard upper bound for ``limit`` so a malicious / buggy client cannot pull
# the entire scan history of a domain in one request.
MAX_TIMELINE_LIMIT = 100

# Time-range window presets accepted by ``GET ?range=...``.
TimelineRange = Literal["7d", "30d", "90d", "all"]
TIMELINE_RANGE_DAYS: dict[TimelineRange, int | None] = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "all": None,
}

# Default cap for findings extracted at diff time — mirrors the dashboard
# top-N (see ``DETAIL_KEY_FINDINGS_LIMIT`` in ``endpoints/scans.py``).
DIFF_KEY_FINDINGS_LIMIT = 8

# Severity buckets shipped to the frontend; kept in this fixed order so the
# diff UI can render columns / colour palettes deterministically.
_SEVERITY_KEYS: tuple[str, ...] = ("critical", "high", "medium", "low")

# Five V2 categoryScores keys mirrored from
# ``shared/types/scan.ts:SecurityScoreBreakdown.categoryScores``.
_CATEGORY_KEYS: tuple[str, ...] = (
    "transport",
    "httpSecurity",
    "threatIntel",
    "infrastructure",
    "bestPractices",
)

# Matches ``endpoints/scans.py`` snake→camel mapping for category names.
_CATEGORY_SNAKE_TO_CAMEL: dict[str, str] = {
    "transport": "transport",
    "http_security": "httpSecurity",
    "threat_intel": "threatIntel",
    "infrastructure": "infrastructure",
    "best_practices": "bestPractices",
}


# ─── Public types ───────────────────────────────────────────────────────


class TimelinePoint(TypedDict):
    """One scan summarised for the trend chart."""

    scanId: str
    completedAt: str | None
    securityScore: int | None
    severity: dict[str, int]


class FindingDelta(TypedDict):
    """Lightweight finding shape returned by the diff endpoint.

    Mirrors the public-facing ``KeyFinding`` (without ``id``) to keep the
    payload small and stable across diff invocations of the same scans.
    """

    title: str
    severity: str
    module: str | None
    description: str | None


class SeverityDelta(TypedDict):
    base: dict[str, int]
    compare: dict[str, int]
    delta: dict[str, int]


class CategoryScoreDelta(TypedDict):
    base: dict[str, float] | None
    compare: dict[str, float] | None
    delta: dict[str, float] | None


class ScanDiff(TypedDict):
    """Payload for ``GET /scans/diff``."""

    baseScanId: str
    compareScanId: str
    addedFindings: list[FindingDelta]
    removedFindings: list[FindingDelta]
    severityDelta: SeverityDelta
    breakdownDelta: CategoryScoreDelta


# ─── Internal helpers ───────────────────────────────────────────────────


def _empty_severity() -> dict[str, int]:
    return {key: 0 for key in _SEVERITY_KEYS}


def _normalize_severity(counts: dict | None) -> dict[str, int]:
    counts = counts or {}
    return {key: int(counts.get(key, 0) or 0) for key in _SEVERITY_KEYS}


def _build_all_raw(module_results: Sequence) -> dict:
    """Collect the SUCCESS-only raw results map used by the analyzers.

    Mirrors ``_compose_scan_detail_payload`` so timeline + diff agree with
    the dashboard on which modules contribute to severity / findings.
    """
    return {
        m.module_name: m.raw_result
        for m in module_results
        if m.status == ModuleStatus.SUCCESS and isinstance(m.raw_result, dict)
    }


def _category_scores_camel(scores: dict | None) -> dict[str, float] | None:
    if not scores:
        return None
    return {
        camel: float(scores.get(snake, 0.0) or 0.0)
        for snake, camel in _CATEGORY_SNAKE_TO_CAMEL.items()
    }


def _finding_key(finding: dict) -> tuple[str, str]:
    """Stable identity for diff comparisons — module + title."""
    module = str(finding.get("module") or "")
    title = str(finding.get("title") or "")
    return module, title


def _to_finding_delta(finding: dict) -> FindingDelta:
    return {
        "title": str(finding.get("title") or ""),
        "severity": str(finding.get("severity") or "info"),
        "module": (
            str(finding["module"]) if finding.get("module") is not None else None
        ),
        "description": (
            str(finding["description"])
            if finding.get("description") is not None
            else None
        ),
    }


# ─── Public service helpers ─────────────────────────────────────────────


async def get_domain_timeline(
    db: AsyncSession,
    *,
    user_id: int,
    domain: str,
    time_range: TimelineRange = "all",
    limit: int = DEFAULT_TIMELINE_LIMIT,
) -> list[TimelinePoint]:
    """Return owner-scoped timeline points for ``domain``.

    Only terminal scans are included (``COMPLETED`` / ``FAILED`` /
    ``CANCELLED``); pending / running scans have no stable severity / score
    yet so they would just add noise to the trend chart. Sorted oldest →
    newest so the frontend ``LineChart`` plots time on the X axis without
    further re-sorting.
    """
    if not domain:
        return []
    if limit <= 0:
        return []
    capped = min(limit, MAX_TIMELINE_LIMIT)

    days_window = TIMELINE_RANGE_DAYS.get(time_range)
    cutoff: datetime | None = None
    if days_window is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_window)

    stmt = (
        select(Scan)
        .where(Scan.user_id == user_id)
        .where(Scan.domain == domain)
        .where(
            Scan.status.in_(
                [ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED]
            )
        )
        .options(selectinload(Scan.module_results))
        .order_by(desc(Scan.completed_at).nulls_last(), desc(Scan.created_at))
        .limit(capped)
    )
    if cutoff is not None:
        stmt = stmt.where(Scan.completed_at >= cutoff)

    result = await db.execute(stmt)
    scans = list(result.scalars().all())

    points: list[TimelinePoint] = []
    for scan in scans:
        all_raw = _build_all_raw(scan.module_results)
        severity = _normalize_severity(compute_severity_counts(all_raw)) if all_raw else _empty_severity()
        completed_at = scan.completed_at.isoformat() if scan.completed_at else None
        points.append(
            {
                "scanId": str(scan.id),
                "completedAt": completed_at,
                "securityScore": (
                    int(scan.security_score) if scan.security_score is not None else None
                ),
                "severity": severity,
            }
        )

    # Oldest → newest is the chart-friendly orientation.
    points.sort(key=lambda p: p["completedAt"] or "")
    return points


def compute_scan_diff(
    base_scan: Scan,
    compare_scan: Scan,
    *,
    key_findings_limit: int = DIFF_KEY_FINDINGS_LIMIT,
) -> ScanDiff:
    """Compute a deterministic diff between two scans (pure, DB-agnostic).

    ``base_scan`` is treated as the "before" snapshot and ``compare_scan``
    as the "after" snapshot. Findings are matched on the ``(module, title)``
    pair — stable enough for the same security_analyzer ruleset and short
    enough that two concurrent scans of an unchanged target collapse to
    zero added / removed entries.
    """
    base_raw = _build_all_raw(base_scan.module_results)
    compare_raw = _build_all_raw(compare_scan.module_results)

    base_findings = extract_key_findings(base_raw, max_findings=key_findings_limit)
    compare_findings = extract_key_findings(compare_raw, max_findings=key_findings_limit)
    base_keys = {_finding_key(f) for f in base_findings}
    compare_keys = {_finding_key(f) for f in compare_findings}

    added: list[FindingDelta] = [
        _to_finding_delta(f) for f in compare_findings if _finding_key(f) not in base_keys
    ]
    removed: list[FindingDelta] = [
        _to_finding_delta(f) for f in base_findings if _finding_key(f) not in compare_keys
    ]

    base_severity = _normalize_severity(compute_severity_counts(base_raw))
    compare_severity = _normalize_severity(compute_severity_counts(compare_raw))
    severity_delta: SeverityDelta = {
        "base": base_severity,
        "compare": compare_severity,
        "delta": {
            key: compare_severity[key] - base_severity[key] for key in _SEVERITY_KEYS
        },
    }

    base_breakdown = compute_security_score_v2(base_raw, base_scan.module_results)
    compare_breakdown = compute_security_score_v2(
        compare_raw, compare_scan.module_results
    )
    base_cat = (
        _category_scores_camel(base_breakdown.category_scores)
        if base_breakdown is not None
        else None
    )
    compare_cat = (
        _category_scores_camel(compare_breakdown.category_scores)
        if compare_breakdown is not None
        else None
    )
    delta_cat: dict[str, float] | None = None
    if base_cat is not None and compare_cat is not None:
        delta_cat = {
            key: round(compare_cat.get(key, 0.0) - base_cat.get(key, 0.0), 4)
            for key in _CATEGORY_KEYS
        }

    breakdown_delta: CategoryScoreDelta = {
        "base": base_cat,
        "compare": compare_cat,
        "delta": delta_cat,
    }

    return {
        "baseScanId": str(base_scan.id),
        "compareScanId": str(compare_scan.id),
        "addedFindings": added,
        "removedFindings": removed,
        "severityDelta": severity_delta,
        "breakdownDelta": breakdown_delta,
    }


__all__ = [
    "DEFAULT_TIMELINE_LIMIT",
    "DIFF_KEY_FINDINGS_LIMIT",
    "MAX_TIMELINE_LIMIT",
    "TIMELINE_RANGE_DAYS",
    "TimelineRange",
    "TimelinePoint",
    "ScanDiff",
    "compute_scan_diff",
    "get_domain_timeline",
]
