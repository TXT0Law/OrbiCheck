import type { ScanDetail } from "@/shared/types/scan";

/**
 * RFC 4180-compliant CSV escaping. Wraps the cell in double quotes when it
 * contains commas, quotes, or newlines and doubles up any embedded quotes.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface CsvRow {
  [column: string]: string | number | null | undefined;
}

/**
 * Serialise rows into a CSV string. The header is taken from the first
 * provided row (callers must give a stable column order). Empty inputs
 * still produce a header line so downstream tooling does not break.
 */
export function rowsToCsv(rows: readonly CsvRow[], headers: readonly string[]): string {
  const headerLine = headers.map(escapeCell).join(",");
  if (rows.length === 0) {
    return headerLine;
  }
  const body = rows.map((row) => headers.map((key) => escapeCell(row[key])).join(","));
  return [headerLine, ...body].join("\n");
}

export function downloadCsv(filename: string, rows: readonly CsvRow[]): void {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csv = rowsToCsv(rows, headers);
  // BOM keeps Excel happy with UTF-8 contents.
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

const MODULE_CSV_HEADERS = [
  "module",
  "status",
  "duration_ms",
  "severity",
  "key_findings_count",
] as const;

/**
 * Produce module-level rows for the scan-detail CSV export. Mirrors the
 * "module, status, duration_ms, severity, key_findings_count" contract
 * spelled out in middleReport.md T4.3 so existing tests / dashboards can
 * snapshot the column set.
 */
export function pickScanModuleCsvRows(detail: ScanDetail): CsvRow[] {
  const findingsByModule = new Map<string, number>();
  for (const finding of detail.keyFindings ?? []) {
    findingsByModule.set(
      finding.module,
      (findingsByModule.get(finding.module) ?? 0) + 1,
    );
  }

  const moduleErrorMap = detail.moduleErrors ?? {};
  // Module severity heuristic: any module with a recorded error is
  // surfaced as the matching severity bucket; otherwise we fall back to
  // the worst severity among findings reported for that module.
  const findingSeverityRanks: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
  };
  const worstFindingSeverity = new Map<string, string>();
  for (const finding of detail.keyFindings ?? []) {
    const current = worstFindingSeverity.get(finding.module);
    if (
      !current ||
      (findingSeverityRanks[finding.severity] ?? 0) > (findingSeverityRanks[current] ?? 0)
    ) {
      worstFindingSeverity.set(finding.module, finding.severity);
    }
  }

  return (detail.moduleJobs ?? []).map((job) => {
    const errorEntry = moduleErrorMap[job.module];
    const severity = errorEntry
      ? errorEntry.status
      : (worstFindingSeverity.get(job.module) ?? "");
    return {
      module: job.module,
      status: job.status,
      duration_ms: job.durationMs,
      severity,
      key_findings_count: findingsByModule.get(job.module) ?? 0,
    } satisfies CsvRow;
  });
}

export const MODULE_CSV_COLUMN_ORDER = MODULE_CSV_HEADERS;
