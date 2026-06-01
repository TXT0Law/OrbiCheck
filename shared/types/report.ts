export type ReportFormat = "pdf" | "markdown" | "html" | "both" | "all";

/** Formats that yield a downloadable artifact (one URL per format). */
export type ReportDownloadFormat = "pdf" | "markdown" | "html";
export type ReportStatus = "pending" | "generating" | "completed" | "failed";
export type ReportPeriod = "24h" | "7d" | "30d" | "90d";
export type ReportScheduleCadence = "weekly" | "monthly";
export type ReportScheduleRunStatus =
  | "pending"
  | "generating"
  | "delivering"
  | "completed"
  | "failed";
export type ReportScheduleDeliveryChannel = "email" | "slack";

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

export interface ReportScheduleRun {
  id: string;
  scheduleId: string;
  reportId: string | null;
  status: ReportScheduleRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  deliverySummary: Record<string, unknown> | null;
}

export interface ReportSchedule {
  id: string;
  userId: number;
  name: string;
  scanId: string | null;
  monitorId: string | null;
  monitorPeriod: ReportPeriod | null;
  format: ReportFormat;
  cadence: ReportScheduleCadence;
  timezone: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  minute: number;
  deliveryChannels: ReportScheduleDeliveryChannel[];
  emailRecipients: string[];
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  recentRuns: ReportScheduleRun[];
}

export interface ReportScheduleCreateParams {
  name: string;
  scanId: string;
  monitorId?: string | null;
  monitorPeriod?: ReportPeriod;
  format?: ReportFormat;
  cadence: ReportScheduleCadence;
  timezone: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hour: number;
  minute: number;
  deliveryChannels: ReportScheduleDeliveryChannel[];
  emailRecipients: string[];
  isEnabled?: boolean;
}

export type ReportScheduleUpdateParams = Partial<ReportScheduleCreateParams>;

export interface ReportScheduleListResult {
  schedules: ReportSchedule[];
}

export interface ReportScheduleRunsResult {
  runs: ReportScheduleRun[];
}
