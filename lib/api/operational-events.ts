import { z } from "zod";

import type {
  OperationalEvent,
  OperationalEventListResult,
} from "@/shared/types/operational-event";

import { apiClient } from "./client";

const operationalEventSchema = z.object({
  id: z.string(),
  userId: z.number().nullable(),
  eventType: z.string(),
  status: z.string(),
  targetUrl: z.string().nullable(),
  scanId: z.string().nullable(),
  monitorId: z.string().nullable(),
  reportId: z.string().nullable(),
  groupId: z.string().nullable(),
  groupRunId: z.string().nullable(),
  groupRunMemberId: z.string().nullable(),
  durationMs: z.number().nullable(),
  retryCount: z.number(),
  errorCode: z.string().nullable(),
  message: z.string().nullable(),
  traceId: z.string().nullable(),
  details: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<OperationalEvent>;

const operationalEventListSchema = z.object({
  events: z.array(operationalEventSchema),
}) satisfies z.ZodType<OperationalEventListResult>;

export async function getReportOperationalEvents(
  reportId: string,
  limit = 25
): Promise<OperationalEventListResult> {
  const { data } = await apiClient.get<OperationalEventListResult>(
    `/reports/${reportId}/events`,
    { params: { limit } }
  );
  return operationalEventListSchema.parse(data);
}

export async function getMonitorOperationalEvents(
  monitorId: string,
  limit = 25
): Promise<OperationalEventListResult> {
  const { data } = await apiClient.get<OperationalEventListResult>(
    `/monitors/${monitorId}/events`,
    { params: { limit } }
  );
  return operationalEventListSchema.parse(data);
}

export async function getScanOperationalEvents(
  scanId: string,
  limit = 25
): Promise<OperationalEventListResult> {
  const { data } = await apiClient.get<OperationalEventListResult>(
    `/scans/${scanId}/events`,
    { params: { limit } }
  );
  return operationalEventListSchema.parse(data);
}

export async function getUrlGroupRunOperationalEvents(
  groupId: string,
  runId: string,
  limit = 25
): Promise<OperationalEventListResult> {
  const { data } = await apiClient.get<OperationalEventListResult>(
    `/url-groups/${groupId}/runs/${runId}/events`,
    { params: { limit } }
  );
  return operationalEventListSchema.parse(data);
}
