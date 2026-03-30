import type {
  ReportCreateParams,
  ReportFormat,
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

export async function downloadReport(reportId: string, format: Extract<ReportFormat, "pdf" | "markdown">) {
  const ext = format === "pdf" ? "pdf" : "md";
  await downloadFromApiGet(`${BASE}/${reportId}/download?format=${format}`, `report-${reportId}.${ext}`);
}
