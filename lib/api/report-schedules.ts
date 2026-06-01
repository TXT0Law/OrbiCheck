import { z } from "zod";

import { parseList, parseSingle } from "./_validate";
import { apiClient } from "./client";

import {
  reportScheduleRunSchema,
  reportScheduleSchema,
} from "@/shared/schemas/report";
import type {
  ReportSchedule,
  ReportScheduleCreateParams,
  ReportScheduleListResult,
  ReportScheduleRunsResult,
  ReportScheduleUpdateParams,
} from "@/shared/types/report";

const BASE = "/report-schedules";
const runNowResponseSchema = z.object({ runId: z.string() });

export async function listReportSchedules(): Promise<ReportScheduleListResult> {
  const { data } = await apiClient.get<{ schedules: unknown[] }>(BASE);
  return {
    schedules: parseList<ReportSchedule>(
      reportScheduleSchema,
      data.schedules,
      "report schedules",
    ),
  };
}

export async function createReportSchedule(
  payload: ReportScheduleCreateParams,
): Promise<ReportSchedule> {
  const { data } = await apiClient.post<unknown>(BASE, payload);
  return parseSingle<ReportSchedule>(
    reportScheduleSchema,
    data,
    "create report schedule",
  );
}

export async function updateReportSchedule(
  id: string,
  payload: ReportScheduleUpdateParams,
): Promise<ReportSchedule> {
  const { data } = await apiClient.put<unknown>(`${BASE}/${id}`, payload);
  return parseSingle<ReportSchedule>(
    reportScheduleSchema,
    data,
    "update report schedule",
  );
}

export async function deleteReportSchedule(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

export async function runReportScheduleNow(id: string): Promise<{ runId: string }> {
  const { data } = await apiClient.post<unknown>(`${BASE}/${id}/run-now`, {});
  return parseSingle<{ runId: string }>(
    runNowResponseSchema,
    data,
    "run report schedule now",
  );
}

export async function listReportScheduleRuns(
  id: string,
): Promise<ReportScheduleRunsResult> {
  const { data } = await apiClient.get<{ runs: unknown[] }>(`${BASE}/${id}/runs`);
  return {
    runs: parseList(
      reportScheduleRunSchema,
      data.runs,
      "report schedule runs",
    ),
  };
}
