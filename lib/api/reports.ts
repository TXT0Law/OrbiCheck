import type {
  ReportCreateParams,
  ReportDownloadFormat,
  ReportListResult,
  ReportPreview,
  ReportRecord,
  ReportStatus,
} from "@/shared/types/report";
import {
  reportListMetaSchema,
  reportListPayloadSchema,
  reportPreviewSchema,
  reportRecordSchema,
} from "@/shared/schemas/report";

import { parseSingle } from "./_validate";
import { apiClient } from "./client";
import { downloadFromApiGet } from "./download";

const BASE = "/reports";

function readMeta(res: object): ReportListResult["meta"] {
  if ("meta" in res && res.meta && typeof res.meta === "object") {
    return parseSingle<NonNullable<ReportListResult["meta"]>>(
      reportListMetaSchema,
      res.meta,
      "report list metadata",
    );
  }
  return undefined;
}

export async function createReport(params: ReportCreateParams): Promise<ReportRecord> {
  const { data } = await apiClient.post<unknown>(BASE, params);
  return parseSingle<ReportRecord>(reportRecordSchema, data, "created report");
}

export async function listReports(params?: {
  page?: number;
  limit?: number;
  status?: ReportStatus;
}): Promise<ReportListResult> {
  const res = await apiClient.get<unknown>(BASE, { params });
  const parsed = parseSingle<{ reports: ReportListResult["reports"] }>(
    reportListPayloadSchema,
    res.data,
    "report list",
  );
  return {
    reports: parsed.reports,
    meta: readMeta(res as object),
  };
}

export async function getReport(reportId: string): Promise<ReportRecord> {
  const { data } = await apiClient.get<unknown>(`${BASE}/${reportId}`);
  return parseSingle<ReportRecord>(reportRecordSchema, data, "report");
}

export async function getReportPreview(reportId: string): Promise<ReportPreview> {
  const { data } = await apiClient.get<unknown>(`${BASE}/${reportId}/preview`);
  return parseSingle<ReportPreview>(
    reportPreviewSchema,
    data,
    "report preview",
  );
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
