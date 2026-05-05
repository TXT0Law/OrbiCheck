import type {
  ReportCreateParams,
  ReportDownloadFormat,
  ReportListResult,
  ReportPreview,
  ReportRecord,
  ReportStatus,
} from "@/shared/types/report";

import { downloadFromApiGet } from "@/lib/utils/export-download";

import { apiClient } from "./client";

const BASE = "/reports";

function readMeta(res: object): ReportListResult["meta"] {
  if ("meta" in res && res.meta && typeof res.meta === "object") {
    return res.meta as ReportListResult["meta"];
  }
  return undefined;
}

export async function createReport(params: ReportCreateParams): Promise<ReportRecord> {
  const { data } = await apiClient.post<ReportRecord>(BASE, params);
  return data;
}

export async function listReports(params?: {
  page?: number;
  limit?: number;
  status?: ReportStatus;
}): Promise<ReportListResult> {
  const res = await apiClient.get<{ reports: ReportListResult["reports"] }>(BASE, { params });
  return {
    reports: res.data.reports,
    meta: readMeta(res as object),
  };
}

export async function getReport(reportId: string): Promise<ReportRecord> {
  const { data } = await apiClient.get<ReportRecord>(`${BASE}/${reportId}`);
  return data;
}

export async function getReportPreview(reportId: string): Promise<ReportPreview> {
  const { data } = await apiClient.get<ReportPreview>(`${BASE}/${reportId}/preview`);
  return data;
}

export async function deleteReport(reportId: string): Promise<void> {
  await apiClient.delete(`${BASE}/${reportId}`);
}

const DOWNLOAD_FORMAT_EXTENSIONS: Record<ReportDownloadFormat, string> = {
  pdf: "pdf",
  markdown: "md",
  html: "html",
};

export async function downloadReport(reportId: string, format: ReportDownloadFormat) {
  const ext = DOWNLOAD_FORMAT_EXTENSIONS[format];
  await downloadFromApiGet(
    `${BASE}/${reportId}/download?format=${format}`,
    `report-${reportId}.${ext}`,
  );
}
