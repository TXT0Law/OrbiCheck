import type { ScanDetail } from "@/shared/types/scan";

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
