export type ReportFormat = "pdf" | "markdown" | "both";
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
