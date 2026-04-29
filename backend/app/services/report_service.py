from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload

from app.api.v1.schemas.monitor import MonitorSslStatusResponse
from app.api.v1.schemas.report import ReportCreateRequest, ReportListItem, ReportPreviewResponse
from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.monitor import Monitor, MonitorChange, MonitorCheck
from app.models.report import Report, ReportFormat, ReportStatus
from app.models.scan import ModuleStatus, Scan, ScanModuleResult, ScanStatus
from app.services.recommendations import generate_recommendations
from app.services.security_analyzer import (
    compute_category_summary,
    compute_severity_counts,
    extract_key_findings,
    resolve_security_score_for_detail,
)
from app.services.transformers import build_scan_detail

__all__ = [
    "build_report_payload_sync",
    "create_report",
    "delete_report",
    "generate_recommendations",
    "generate_report_artifacts_sync",
    "get_report",
    "get_report_download",
    "get_report_preview",
    "list_reports",
    "render_markdown",
    "render_pdf",
]

logger = logging.getLogger(__name__)

# Default value used when a category score is missing or non-numeric.
_DEFAULT_CATEGORY_SCORE = 0.0

# Legacy → canonical key map; supports old snake_case payloads (pre-2026-04 contract).
_LEGACY_CATEGORY_KEY_ALIASES: dict[str, str] = {
    "http_security": "httpSecurity",
    "threat_intel": "threatIntel",
    "best_practices": "bestPractices",
}


def _as_tech_list(value: object) -> list[dict]:
    """Normalize techStack to a list of dicts (handles both list and dict shapes)."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        techs = value.get("technologies", [])
        if isinstance(techs, list):
            return [item for item in techs if isinstance(item, dict)]
    return []


def _port_entries(value: object) -> list[dict]:
    """Normalize ports to entries regardless of legacy or transformed shape."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        entries = value.get("entries", [])
        if isinstance(entries, list):
            return [item for item in entries if isinstance(item, dict)]
    return []


PDF_ENABLED_FORMATS = {ReportFormat.PDF, ReportFormat.BOTH}
MARKDOWN_ENABLED_FORMATS = {ReportFormat.MARKDOWN, ReportFormat.BOTH, ReportFormat.PDF}


def _score_grade(score: int | None) -> str:
    if score is None:
        return "N/A"
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _stringify(value: object | None, fallback: str = "N/A") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _truncate(value: str | None, limit: int = 72) -> str:
    text = _stringify(value, "")
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 3)]}..."


def _format_duration_ms(duration_ms: int | None) -> str:
    if duration_ms is None or duration_ms <= 0:
        return "N/A"
    seconds = round(duration_ms / 1000, 1)
    if seconds < 60:
        return f"{seconds}s"
    minutes = int(seconds // 60)
    rem = round(seconds % 60, 1)
    return f"{minutes}m {rem}s"


def _pdf_write_section(pdf, title: str, body: str) -> None:
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(0, 6, body or "N/A")
    pdf.ln(2)


def _safe_domain(url: str) -> str:
    return urlparse(url).hostname or url


def _collect_raw_results(module_results: list[ScanModuleResult]) -> dict[str, dict]:
    return {
        item.module_name: item.raw_result
        for item in module_results
        if item.raw_result is not None
    }


def _build_module_summary(module_results: list[ScanModuleResult]) -> list[dict[str, str | int | None]]:
    return [
        {
            "module": item.module_name,
            "status": item.status.value,
            "duration": item.duration_ms,
            "error": item.error_message,
        }
        for item in module_results
    ]


def _sum_module_duration_ms(module_results: list[ScanModuleResult]) -> int:
    return sum(item.duration_ms or 0 for item in module_results)


def _monitor_failure_distribution(rows: list[MonitorCheck]) -> dict[str, int]:
    counts = {"TIMEOUT": 0, "DNS": 0, "CONNECTION": 0, "SSL": 0, "HTTP_ERROR": 0, "UNKNOWN": 0}
    for row in rows:
        error = (row.error_type.value if row.error_type else "unknown").lower()
        if error == "timeout":
            counts["TIMEOUT"] += 1
        elif error == "dns_resolution":
            counts["DNS"] += 1
        elif error == "connection_refused":
            counts["CONNECTION"] += 1
        elif error == "ssl_error":
            counts["SSL"] += 1
        elif error == "http_error":
            counts["HTTP_ERROR"] += 1
        else:
            counts["UNKNOWN"] += 1
    return counts


def _monitor_current_streak(rows: list[MonitorCheck]) -> dict[str, object] | None:
    if not rows:
        return None
    last_success = bool(rows[-1].success)
    count = 0
    for row in reversed(rows):
        if bool(row.success) != last_success:
            break
        count += 1
    return {
        "status": "up" if last_success else "down",
        "count": count,
    }


def _monitor_incidents(rows: list[MonitorCheck]) -> int:
    incidents = 0
    prev_success = True
    for row in rows:
        current_success = bool(row.success)
        if prev_success and not current_success:
            incidents += 1
        prev_success = current_success
    return incidents


def _recent_change_summary(row: MonitorChange) -> dict[str, str | int]:
    diff_summary = row.diff_summary if isinstance(row.diff_summary, dict) else {}
    return {
        "detectedAt": row.detected_at.isoformat(),
        "changeCategory": str(diff_summary.get("changeCategory", "unknown")),
        "linesAdded": int(diff_summary.get("linesAdded", 0) or 0),
        "linesRemoved": int(diff_summary.get("linesRemoved", 0) or 0),
    }


def _security_score_breakdown_dict(breakdown: object | None) -> dict | None:
    """Map a ``SecurityScoreResult`` to the canonical camelCase shape.

    Mirrors ``GET /scans/{id}/detail:securityScoreBreakdown`` so the offline
    report payload and the live detail response share one source of truth
    (``shared/types/scan.ts:SecurityScoreBreakdown``).
    """
    if breakdown is None:
        return None
    raw_scores = getattr(breakdown, "category_scores", {}) or {}
    return {
        "baseScore": getattr(breakdown, "base_score", _DEFAULT_CATEGORY_SCORE),
        "confidence": getattr(breakdown, "confidence", _DEFAULT_CATEGORY_SCORE),
        "severityCapApplied": getattr(breakdown, "severity_cap_applied", None),
        "categoryScores": {
            "transport": raw_scores.get("transport", _DEFAULT_CATEGORY_SCORE),
            "httpSecurity": raw_scores.get("http_security", _DEFAULT_CATEGORY_SCORE),
            "threatIntel": raw_scores.get("threat_intel", _DEFAULT_CATEGORY_SCORE),
            "infrastructure": raw_scores.get("infrastructure", _DEFAULT_CATEGORY_SCORE),
            "bestPractices": raw_scores.get("best_practices", _DEFAULT_CATEGORY_SCORE),
        },
    }


def _read_breakdown_category_scores(scan: dict) -> dict[str, float]:
    """Return categoryScores normalized to camelCase keys.

    Tolerates legacy snake_case payloads (``category_scores`` / ``http_security``
    / ``threat_intel`` / ``best_practices``) for backward compatibility with any
    cached payload created before the 2026-04 contract alignment. Logs a
    deprecation warning when a legacy shape is detected.
    """
    breakdown = scan.get("securityScoreBreakdown")
    if not isinstance(breakdown, dict):
        return {}

    scores = breakdown.get("categoryScores")
    if not isinstance(scores, dict):
        legacy_scores = breakdown.get("category_scores")
        if isinstance(legacy_scores, dict):
            logger.warning(
                "Legacy snake_case 'category_scores' detected in report payload; "
                "callers should emit camelCase 'categoryScores'.",
            )
            scores = legacy_scores
        else:
            return {}

    normalized: dict[str, float] = {}
    for key, value in scores.items():
        camel_key = _LEGACY_CATEGORY_KEY_ALIASES.get(key, key)
        try:
            normalized[camel_key] = float(value)
        except (TypeError, ValueError):
            normalized[camel_key] = _DEFAULT_CATEGORY_SCORE
    return normalized


def _build_monitor_summary_sync(
    db: Session,
    monitor_id: uuid.UUID,
    user_id: int,
    period: str,
) -> dict | None:
    monitor = db.get(Monitor, monitor_id)
    if not monitor or monitor.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")

    delta_map = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}
    days = delta_map.get(period, 30)
    cutoff = datetime.now(timezone.utc).timestamp() - (days * 24 * 60 * 60)

    check_rows = list(
        db.execute(
            select(MonitorCheck)
            .where(
                MonitorCheck.monitor_id == monitor_id,
                func.extract("epoch", MonitorCheck.checked_at) >= cutoff,
            )
            .order_by(MonitorCheck.checked_at.asc())
        ).scalars()
    )
    change_rows = list(
        db.execute(
            select(MonitorChange)
            .where(
                MonitorChange.monitor_id == monitor_id,
                func.extract("epoch", MonitorChange.detected_at) >= cutoff,
            )
            .order_by(MonitorChange.detected_at.desc())
            .limit(10)
        ).scalars()
    )

    total_checks = len(check_rows)
    successful_checks = sum(1 for row in check_rows if row.success)
    failed_checks = total_checks - successful_checks
    latencies = [float(row.response_time_ms) for row in check_rows if row.success]
    sorted_latencies = sorted(latencies)
    p95_idx = max(0, min(len(sorted_latencies) - 1, int(len(sorted_latencies) * 0.95) - 1))
    ssl_row = db.execute(
        select(MonitorCheck)
        .where(
            MonitorCheck.monitor_id == monitor_id,
            MonitorCheck.ssl_snapshot.is_not(None),
        )
        .order_by(MonitorCheck.checked_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    ssl_payload = ssl_row.ssl_snapshot if ssl_row and isinstance(ssl_row.ssl_snapshot, dict) else {}
    ssl_summary = MonitorSslStatusResponse(
        days_remaining=ssl_payload.get("days_remaining"),
        expiry_date=ssl_payload.get("expiry_date"),
        issuer=ssl_payload.get("issuer"),
        subject=ssl_payload.get("subject"),
        is_valid=bool(ssl_payload.get("is_valid", False)),
        severity_level=str(ssl_payload.get("severity_level", "unknown")),
        is_expiring_soon=bool(ssl_payload.get("is_expiring_soon", False)),
        is_expired=bool(ssl_payload.get("is_expired", False)),
        subject_alternative_names=list(ssl_payload.get("subject_alternative_names", []) or []),
        last_checked_at=ssl_row.checked_at if ssl_row else None,
        valid_from=str(ssl_payload.get("valid_from", "") or ""),
        valid_to=str(ssl_payload.get("valid_to", "") or ""),
    )

    return {
        "displayName": monitor.display_name,
        "url": monitor.url,
        "period": period,
        "uptime": {
            "period": period,
            "totalChecks": total_checks,
            "successfulChecks": successful_checks,
            "failedChecks": failed_checks,
            "uptimePercentage": round((successful_checks / total_checks) * 100, 2)
            if total_checks
            else 0.0,
            "avgResponseTimeMs": round(sum(latencies) / len(latencies), 2) if latencies else 0.0,
            "p95ResponseTimeMs": round(sorted_latencies[p95_idx], 2) if sorted_latencies else 0.0,
            "incidents": _monitor_incidents(check_rows),
            "currentStreak": _monitor_current_streak(check_rows),
            "failureDistribution": _monitor_failure_distribution(check_rows),
        },
        "changesCount": len(change_rows),
        "recentChanges": [_recent_change_summary(row) for row in change_rows],
        "ssl": ssl_summary.model_dump(by_alias=True),
    }


def build_report_payload_sync(db: Session, report: Report) -> dict:
    if report.scan_id is None:
        raise ValidationError(code="REPORT_SCAN_REQUIRED", message="Report must reference a scan")

    scan = db.execute(
        select(Scan)
        .where(Scan.id == report.scan_id)
        .options(selectinload(Scan.module_results))
    ).scalar_one_or_none()
    if scan is None or scan.user_id != report.user_id:
        raise NotFoundError(code="SCAN_NOT_FOUND", message="Scan not found")

    all_raw = _collect_raw_results(scan.module_results)
    detail = build_scan_detail(str(scan.id), scan.url, all_raw)
    resolved_score = resolve_security_score_for_detail(
        stored_score=scan.security_score,
        scan_status=scan.status,
        module_results=scan.module_results,
        all_raw=all_raw,
    )
    severity = compute_severity_counts(all_raw)
    category_summary = compute_category_summary(all_raw)
    key_findings = extract_key_findings(all_raw)
    recommendations = generate_recommendations(detail, key_findings)
    monitor_summary = None
    if report.monitor_id is not None:
        monitor_summary = _build_monitor_summary_sync(
            db=db,
            monitor_id=report.monitor_id,
            user_id=report.user_id,
            period=report.monitor_period or "30d",
        )

    meta = {
        "scanDomain": scan.domain,
        "scanUrl": scan.url,
        "score": resolved_score.score,
        "severity": severity,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    total_duration_ms = _sum_module_duration_ms(scan.module_results)

    return {
        "meta": meta,
        "reportId": str(report.id),
        "title": report.title,
        "scan": {
            "id": str(scan.id),
            "domain": scan.domain,
            "url": scan.url,
            "status": scan.status.value,
            "scannedAt": scan.completed_at.isoformat() if scan.completed_at else None,
            "duration": _format_duration_ms(total_duration_ms if total_duration_ms > 0 else None),
            "totalDurationMs": total_duration_ms,
            "detail": detail,
            "securityScore": resolved_score.score,
            "securityScoreBreakdown": _security_score_breakdown_dict(
                resolved_score.breakdown
            ),
            "severity": severity,
            "categorySummary": category_summary,
            "keyFindings": key_findings,
            "moduleSummary": _build_module_summary(scan.module_results),
            "moduleErrors": [
                {
                    "module": item.module_name,
                    "error": item.error_message or "Unknown error",
                }
                for item in scan.module_results
                if item.status in {ModuleStatus.FAILED, ModuleStatus.TIMEOUT}
            ],
        },
        "monitor": monitor_summary,
        "recommendations": recommendations,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def render_markdown(report_data: dict) -> str:
    scan = report_data["scan"]
    detail = scan["detail"]
    score = scan["securityScore"]
    severity = scan["severity"]
    breakdown = _read_breakdown_category_scores(scan)
    headers = (detail.get("headers") or {}).get("securityChecks", [])
    ports = _port_entries(detail.get("ports"))
    uptime = (report_data.get("monitor") or {}).get("uptime") or {}
    monitor_ssl = (report_data.get("monitor") or {}).get("ssl") or {}
    lines = [
        f"# Security Assessment Report - {scan['domain']}",
        "",
        (
            f"**Generated**: {report_data['generatedAt']}  |  "
            f"**Target**: {scan['url']}  |  **Report ID**: {report_data['reportId']}"
        ),
        "",
        "---",
        "",
        "## 1. Executive Summary",
        "",
        f"**Security Score**: {_stringify(score)}/100 ({_score_grade(score)})",
        f"**Scan Status**: {scan['status']}  |  **Duration**: {scan['duration']}",
        f"**Scanned At**: {_stringify(scan['scannedAt'])}",
        "",
        "### Severity Overview",
        "| Level | Count |",
        "|---|---:|",
        f"| Critical | {severity['critical']} |",
        f"| High | {severity['high']} |",
        f"| Medium | {severity['medium']} |",
        f"| Low | {severity['low']} |",
        "",
        "### Top Findings",
    ]
    for index, finding in enumerate(scan["keyFindings"][:8], start=1):
        lines.append(
            f"{index}. [{finding['severity']}] {finding['title']} - {finding['description']}"
        )
    if not scan["keyFindings"]:
        lines.append("1. No high-priority findings were extracted from available module data.")

    lines.extend(
        [
            "",
            "---",
            "",
            "## 2. Security Score Breakdown",
            "",
            "| Category | Score |",
            "|---|---:|",
            f"| Transport | {round(breakdown.get('transport', _DEFAULT_CATEGORY_SCORE), 2)} |",
            f"| HTTP Security | {round(breakdown.get('httpSecurity', _DEFAULT_CATEGORY_SCORE), 2)} |",
            f"| Threat Intel | {round(breakdown.get('threatIntel', _DEFAULT_CATEGORY_SCORE), 2)} |",
            f"| Infrastructure | {round(breakdown.get('infrastructure', _DEFAULT_CATEGORY_SCORE), 2)} |",
            f"| Best Practices | {round(breakdown.get('bestPractices', _DEFAULT_CATEGORY_SCORE), 2)} |",
            "",
            "---",
            "",
            "## 3. Category Assessment",
            "",
            "### 3.1 Transport Security (SSL/TLS)",
            (
                f"- Certificate: {_stringify((detail.get('ssl') or {}).get('issuer'))}, "
                f"valid until {_stringify((detail.get('ssl') or {}).get('validTo'))}"
            ),
            (
                f"- TLS grade: {_stringify((detail.get('tls') or {}).get('grade'))}  |  "
                f"HSTS: {'enabled' if (detail.get('hsts') or {}).get('enabled') else 'disabled'}"
            ),
            "",
            "### 3.2 HTTP Security Headers",
            "| Header | Present | Value |",
            "|---|---|---|",
        ]
    )
    for check in headers[:8]:
        lines.append(
            f"| {check.get('name', 'unknown')} | "
            f"{'yes' if check.get('status') == 'pass' else 'no'} | "
            f"{_truncate(check.get('value'))} |"
        )

    lines.extend(
        [
            "",
            "### 3.3 DNS & Infrastructure",
            (
                f"- IP: {_stringify((detail.get('ip') or {}).get('ip'))} "
                f"({_stringify((detail.get('ip') or {}).get('country'))})"
            ),
            (
                f"- DNS records: A={len((detail.get('dns') or {}).get('a', []))}, "
                f"MX={len((detail.get('dns') or {}).get('mx', []))}, "
                f"NS={len((detail.get('dns') or {}).get('ns', []))}"
            ),
            f"- DNSSEC: {'enabled' if (detail.get('dnssec') or {}).get('enabled') else 'disabled'}",
            (
                "- Open ports: "
                + (
                    ", ".join(str(port.get("port")) for port in ports[:8] if isinstance(port, dict))
                    if ports
                    else "none detected"
                )
            ),
            (
                f"- Firewall/WAF: "
                f"{'detected' if (detail.get('firewall') or {}).get('hasWaf') else 'not detected'}"
            ),
            "",
            "### 3.4 Threat Intelligence",
            (
                f"- Threat listed: "
                f"{'yes' if (detail.get('threats') or {}).get('safeBrowsing') else 'no evidence'}"
            ),
            "",
            "### 3.5 Content & Best Practices",
            (
                "- Tech stack: "
                + ", ".join(
                    item.get("name", "unknown")
                    for item in _as_tech_list(detail.get("techStack"))[:8]
                )
            ),
            f"- Robots.txt: {'present' if (detail.get('robotsTxt') or {}).get('robots') else 'absent'}",
            f"- Sitemap: {'present' if (detail.get('sitemap') or {}).get('items') else 'absent'}",
            "",
        ]
    )

    if report_data.get("monitor"):
        lines.extend(
            [
                "---",
                "",
                "## 4. Monitoring Summary",
                "",
                (
                    f"**Monitor**: {report_data['monitor']['displayName']}  |  "
                    f"**Period**: {report_data['monitor']['period']}"
                ),
                "",
                "### 4.1 Availability",
                f"- Uptime: {uptime.get('uptimePercentage', 0)}%",
                (
                    f"- Avg Response Time: {uptime.get('avgResponseTimeMs', 0)}ms  |  "
                    f"P95: {uptime.get('p95ResponseTimeMs', 0)}ms"
                ),
                (
                    f"- Total Checks: {uptime.get('totalChecks', 0)}  |  "
                    f"Incidents: {uptime.get('incidents', 0)}"
                ),
                "### 4.2 Content Changes",
                (
                    f"- Changes detected: {report_data['monitor']['changesCount']} "
                    f"in last {report_data['monitor']['period']}"
                ),
                "### 4.3 SSL Certificate",
                f"- Issuer: {_stringify(monitor_ssl.get('issuer'))}",
                (
                    f"- Expires: {_stringify(monitor_ssl.get('expiryDate'))} "
                    f"({_stringify(monitor_ssl.get('daysRemaining'))} days remaining)"
                ),
                "",
            ]
        )

    lines.extend(["---", "", "## 5. Recommendations", ""])
    for index, item in enumerate(report_data["recommendations"], start=1):
        lines.append(f"{index}. **[{item['severity'].upper()}]** {item['title']} - {item['description']}")

    lines.extend(["", "---", "", "## 6. Appendix", "", "### A. Module Execution Summary", "", "| Module | Status | Duration |", "|---|---|---:|"])
    for item in scan["moduleSummary"]:
        lines.append(
            f"| {item['module']} | {item['status']} | {_stringify(item['duration'], '0')}ms |"
        )
    lines.extend(["", "### B. Failed Modules", "", "| Module | Error |", "|---|---|"])
    for item in scan["moduleErrors"]:
        lines.append(f"| {item['module']} | {_truncate(item['error'], 120)} |")
    if not scan["moduleErrors"]:
        lines.append("| none | none |")

    return "\n".join(lines)


def render_pdf(report_data: dict) -> bytes:
    from fpdf import FPDF

    class ReportPdf(FPDF):
        def footer(self) -> None:
            self.set_y(-10)
            self.set_font("Helvetica", size=8)
            self.cell(0, 6, f"Page {self.page_no()}", align="C")

    pdf = ReportPdf()
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    logo_path = settings.REPORT_PDF_LOGO_PATH
    if logo_path and os.path.exists(logo_path):
        pdf.image(logo_path, x=10, y=10, w=24)
        pdf.ln(20)

    scan = report_data["scan"]
    detail = scan["detail"]
    score = scan["securityScore"]
    severity = scan["severity"]
    breakdown = _read_breakdown_category_scores(scan)
    headers = (detail.get("headers") or {}).get("securityChecks", [])
    ports = _port_entries(detail.get("ports"))
    pdf.set_font("Helvetica", "B", 20)
    pdf.multi_cell(0, 12, f"Security Assessment Report\n{scan['domain']}")
    pdf.ln(4)
    pdf.set_font("Helvetica", size=11)
    pdf.multi_cell(
        0,
        7,
        (
            f"Generated: {report_data['generatedAt']}\n"
            f"Target: {scan['url']}\n"
            f"Score: {_stringify(score)}/100 ({_score_grade(score)})"
        ),
    )
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Severity overview", new_x="LMARGIN", new_y="NEXT")
    col_w = (pdf.w - 20) / 4
    for label, value, color in (
        ("Critical", severity["critical"], (220, 38, 38)),
        ("High", severity["high"], (234, 88, 12)),
        ("Medium", severity["medium"], (202, 138, 4)),
        ("Low", severity["low"], (37, 99, 235)),
    ):
        pdf.set_fill_color(*color)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(col_w, 8, f"{label}: {value}", border=1, fill=True)
    pdf.ln(12)
    pdf.set_text_color(0, 0, 0)

    _pdf_write_section(
        pdf,
        "Executive Summary",
        f"Status: {scan['status']}\nDuration: {scan['duration']}",
    )

    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "Security Score Breakdown", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 10)
    breakdown_col_w = (pdf.w - 20) / 2
    pdf.cell(breakdown_col_w, 7, "Category", border=1)
    pdf.cell(breakdown_col_w, 7, "Score", border=1)
    pdf.ln()
    pdf.set_font("Helvetica", size=9)
    for label, value in (
        ("Transport", round(breakdown.get("transport", _DEFAULT_CATEGORY_SCORE), 2)),
        ("HTTP Security", round(breakdown.get("httpSecurity", _DEFAULT_CATEGORY_SCORE), 2)),
        ("Threat Intel", round(breakdown.get("threatIntel", _DEFAULT_CATEGORY_SCORE), 2)),
        ("Infrastructure", round(breakdown.get("infrastructure", _DEFAULT_CATEGORY_SCORE), 2)),
        ("Best Practices", round(breakdown.get("bestPractices", _DEFAULT_CATEGORY_SCORE), 2)),
    ):
        pdf.cell(breakdown_col_w, 7, label, border=1)
        pdf.cell(breakdown_col_w, 7, str(value), border=1)
        pdf.ln()
    pdf.ln(3)

    category_lines = [
        "Transport Security (SSL/TLS)",
        (
            f"- Certificate: {_stringify((detail.get('ssl') or {}).get('issuer'))}, "
            f"valid until {_stringify((detail.get('ssl') or {}).get('validTo'))}"
        ),
        (
            f"- TLS grade: {_stringify((detail.get('tls') or {}).get('grade'))}, "
            f"HSTS: {'enabled' if (detail.get('hsts') or {}).get('enabled') else 'disabled'}"
        ),
        "",
        "HTTP Security Headers",
    ]
    if headers:
        for check in headers[:5]:
            category_lines.append(
                f"- {check.get('name', 'unknown')}: "
                f"{'present' if check.get('status') == 'pass' else 'missing'}"
            )
    else:
        category_lines.append("- No header details available.")

    category_lines.extend(
        [
            "",
            "DNS & Infrastructure",
            (
                f"- IP: {_stringify((detail.get('ip') or {}).get('ip'))} "
                f"({_stringify((detail.get('ip') or {}).get('country'))})"
            ),
            (
                f"- Open ports: "
                f"{', '.join(str(port.get('port')) for port in ports[:8] if isinstance(port, dict)) or 'none detected'}"
            ),
            (
                f"- Firewall/WAF: "
                f"{'detected' if (detail.get('firewall') or {}).get('hasWaf') else 'not detected'}"
            ),
            "",
            "Threat Intelligence",
            (
                f"- Threat listed: "
                f"{'yes' if (detail.get('threats') or {}).get('safeBrowsing') else 'no evidence'}"
            ),
            "",
            "Content & Best Practices",
            (
                "- Tech stack: "
                + ", ".join(
                    item.get("name", "unknown")
                    for item in _as_tech_list(detail.get("techStack"))[:8]
                )
            ),
            f"- Robots.txt: {'present' if (detail.get('robotsTxt') or {}).get('robots') else 'absent'}",
            f"- Sitemap: {'present' if (detail.get('sitemap') or {}).get('items') else 'absent'}",
        ]
    )
    _pdf_write_section(pdf, "Category Assessment", "\n".join(category_lines))

    _pdf_write_section(
        pdf,
        "Top Findings",
        "\n".join(
            f"- [{item['severity']}] {item['title']}: {item['description']}"
            for item in scan["keyFindings"][:8]
        )
        or "- No high-priority findings extracted.",
    )

    if report_data.get("monitor"):
        uptime = report_data["monitor"]["uptime"]
        _pdf_write_section(
            pdf,
            "Monitoring Summary",
            (
                f"Monitor: {report_data['monitor']['displayName']}\n"
                f"Period: {report_data['monitor']['period']}\n"
                f"Uptime: {uptime['uptimePercentage']}%\n"
                f"Checks: {uptime['totalChecks']}\n"
                f"Changes: {report_data['monitor']['changesCount']}"
            ),
        )

    _pdf_write_section(
        pdf,
        "Recommendations",
        "\n".join(
            f"- [{item['severity'].upper()}] {item['title']}: {item['description']}"
            for item in report_data["recommendations"]
        ),
    )

    appendix_lines = [
        "Module Execution Summary",
        *[
            f"- {item['module']}: {item['status']} ({_stringify(item['duration'], '0')}ms)"
            for item in scan["moduleSummary"][:12]
        ],
    ]
    if scan["moduleErrors"]:
        appendix_lines.extend(["", "Failed Modules"])
        appendix_lines.extend(
            f"- {item['module']}: {_truncate(item['error'], 120)}"
            for item in scan["moduleErrors"][:10]
        )
    _pdf_write_section(pdf, "Appendix", "\n".join(appendix_lines))

    out = pdf.output()
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return out.encode("latin-1")


def generate_report_artifacts_sync(db: Session, report: Report) -> tuple[str, bytes | None, dict]:
    report_data = build_report_payload_sync(db, report)
    content_md = render_markdown(report_data)
    content_pdf = render_pdf(report_data) if report.format in PDF_ENABLED_FORMATS else None
    meta = report_data["meta"] | {
        "title": report.title,
        "monitorIncluded": report.monitor_id is not None,
        "format": report.format.value,
    }
    return content_md, content_pdf, meta


async def create_report(
    db: AsyncSession,
    user_id: int,
    request: ReportCreateRequest,
) -> Report:
    if not settings.REPORT_GENERATION_ENABLED:
        raise ValidationError(code="REPORT_DISABLED", message="Report generation is disabled")

    total = int(await db.scalar(select(func.count()).select_from(Report).where(Report.user_id == user_id)) or 0)
    if total >= settings.REPORT_MAX_PER_USER:
        raise ValidationError(code="REPORT_LIMIT_REACHED", message="Maximum reports reached")

    scan = await db.get(Scan, request.scan_id)
    if scan is None or scan.user_id != user_id:
        raise NotFoundError(code="SCAN_NOT_FOUND", message="Scan not found")
    if scan.status != ScanStatus.COMPLETED:
        raise ValidationError(
            code="SCAN_NOT_READY",
            message="Reports can only be generated from completed scans",
        )

    if request.monitor_id is not None:
        monitor = await db.get(Monitor, request.monitor_id)
        if monitor is None or monitor.user_id != user_id:
            raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")

    title = (request.title or "").strip()
    if not title:
        created = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        title = f"Security Report - {scan.domain} - {created}"

    report = Report(
        user_id=user_id,
        title=title,
        format=ReportFormat(request.format),
        status=ReportStatus.PENDING,
        scan_id=request.scan_id,
        monitor_id=request.monitor_id,
        monitor_period=request.monitor_period,
        report_meta={"scanDomain": scan.domain, "scanUrl": scan.url},
    )
    db.add(report)
    await db.flush()
    return report


async def list_reports(
    db: AsyncSession,
    user_id: int,
    *,
    page: int,
    limit: int,
    status: str | None,
) -> tuple[list[ReportListItem], dict[str, int | str | None]]:
    filters = [Report.user_id == user_id]
    if status:
        filters.append(Report.status == ReportStatus(status))

    total = int(await db.scalar(select(func.count()).select_from(Report).where(*filters)) or 0)
    rows = list(
        (
            await db.execute(
                select(Report)
                .where(*filters)
                .order_by(Report.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        ).scalars()
    )
    items = [
        ReportListItem(
            id=row.id,
            title=row.title,
            format=row.format,
            status=row.status,
            scan_domain=((row.report_meta or {}).get("scanDomain") if row.report_meta else None),
            file_size_bytes=row.file_size_bytes,
            created_at=row.created_at,
            completed_at=row.completed_at,
        )
        for row in rows
    ]
    return items, {"page": page, "limit": limit, "total": total, "status": status}


async def get_report(db: AsyncSession, report_id: uuid.UUID, user_id: int) -> Report:
    report = await db.get(Report, report_id)
    if report is None or report.user_id != user_id:
        raise NotFoundError(code="REPORT_NOT_FOUND", message="Report not found")
    return report


async def get_report_preview(
    db: AsyncSession,
    report_id: uuid.UUID,
    user_id: int,
) -> ReportPreviewResponse:
    report = await get_report(db, report_id, user_id)
    if not report.content_md:
        raise ValidationError(code="REPORT_NOT_READY", message="Report preview is not ready yet")
    return ReportPreviewResponse(
        id=report.id,
        title=report.title,
        status=report.status,
        content_md=report.content_md,
        report_meta=report.report_meta,
    )


async def delete_report(db: AsyncSession, report_id: uuid.UUID, user_id: int) -> None:
    report = await get_report(db, report_id, user_id)
    await db.delete(report)


async def get_report_download(
    db: AsyncSession,
    report_id: uuid.UUID,
    user_id: int,
    fmt: str,
) -> tuple[bytes, str, str]:
    report = await get_report(db, report_id, user_id)
    domain = ((report.report_meta or {}).get("scanDomain") or str(report.id)).replace(" ", "-")
    safe_domain = "".join(char for char in domain if char.isalnum() or char in {".", "-", "_"})
    if fmt == "markdown":
        if not report.content_md:
            raise ValidationError(code="REPORT_NOT_READY", message="Markdown report is not ready")
        return (
            report.content_md.encode("utf-8"),
            f"{safe_domain}-report.md",
            "text/markdown; charset=utf-8",
        )
    if fmt == "pdf":
        if not report.content_pdf:
            raise ValidationError(code="REPORT_NOT_READY", message="PDF report is not ready")
        return report.content_pdf, f"{safe_domain}-report.pdf", "application/pdf"
    raise ValidationError(code="REPORT_FORMAT_INVALID", message="Unsupported report format")
