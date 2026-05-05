import type { ScanDetail } from "@/shared/types/scan";

/**
 * Wire shape returned by ``GET /scans/{id}/detail/full``.
 *
 * The summary mirrors ``ScanDetail`` plus all transformer-derived module
 * sections; ``rawResults`` carries the untouched per-module payload (status,
 * duration, raw_result) keyed by module name. Treated as ``unknown`` because
 * raw module shapes drift faster than the transformer contracts (T4.1).
 */
export interface ScanFullExport {
  summary: ScanDetail;
  rawResults: Record<
    string,
    {
      status: string;
      durationMs: number | null;
      errorMessage: string | null;
      rawResult: unknown;
    }
  >;
  exportedAt: string;
}

/** Summary fields only — avoids huge blobs in exports. */
export function pickScanDetailExportSummary(detail: ScanDetail) {
  return {
    id: detail.id,
    domain: detail.domain,
    url: detail.url,
    status: detail.status,
    scannedAt: detail.scannedAt,
    duration: detail.duration,
    totalDurationMs: detail.totalDurationMs,
    securityScore: detail.securityScore,
    severity: detail.severity,
    categorySummary: detail.categorySummary,
    keyFindings: detail.keyFindings,
    moduleJobs: detail.moduleJobs,
    moduleErrors: detail.moduleErrors,
  };
}

/**
 * Compose the JSON blob written by the "Export full (JSON)" action: the
 * summary fields a user sees on the dashboard plus every module's raw
 * payload. Pure / deterministic — easy to snapshot in vitest.
 */
export function pickScanFullExport(detail: ScanDetail, full: ScanFullExport) {
  return {
    summary: pickScanDetailExportSummary(detail),
    detail: full.summary,
    rawResults: full.rawResults,
    exportedAt: full.exportedAt,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}
