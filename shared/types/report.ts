export type ReportFormat = "pdf" | "markdown" | "html" | "both" | "all";

/** Formats that yield a downloadable artifact (one URL per format). */
export type ReportDownloadFormat = "pdf" | "markdown" | "html";
export type ReportStatus = "pending" | "generating" | "completed" | "failed";
export type ReportPeriod = "24h" | "7d" | "30d" | "90d";

export interface ReportCreateParams {
  scanId: string;
  monitorId?: string;
  monitorPeriod?: ReportPeriod;
  format?: ReportFormat;
  title?: string;
}

export interface ReportRecord {
  id: string;
  title: string;
  format: ReportFormat;
  status: ReportStatus;
  scanId: string | null;
  monitorId: string | null;
  monitorPeriod: ReportPeriod | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  reportMeta?: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ReportListItem {
  id: string;
  title: string;
  format: ReportFormat;
  status: ReportStatus;
  /**
   * Backing scan id, mirrored from ``Report.scan_id``. May be null when the
   * source scan has been deleted (FK is ON DELETE SET NULL). Used by the
   * Reports list page to deep-link into the scan-to-scan diff (T5.2).
   */
  scanId: string | null;
  scanDomain: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ReportListResult {
  reports: ReportListItem[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    status?: ReportStatus | null;
  };
}

export interface ReportPreview {
  id: string;
  title: string;
  status: ReportStatus;
  contentMd: string;
  reportMeta?: Record<string, unknown> | null;
}
