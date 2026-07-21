import type { AlertEvent, MonitorListMeta } from "@/shared/types/monitor";
import {
  alertEventSchema,
  monitorListMetaSchema,
} from "@/shared/schemas/monitor";

import { parseList, parseSingle } from "./_validate";
import { apiClient } from "./client";

interface AlertQueryParams {
  page?: number;
  limit?: number;
  monitorId?: string;
  capability?: string;
  severity?: "info" | "warning" | "critical";
  suppressed?: boolean;
  acknowledged?: boolean;
}

function readMeta(res: object): MonitorListMeta | undefined {
  if ("meta" in res && res.meta && typeof res.meta === "object") {
    return parseSingle<MonitorListMeta>(
      monitorListMetaSchema,
      res.meta,
      "alert list metadata",
    );
  }
  return undefined;
}

function buildQuery(params?: AlertQueryParams): string {
  const query = new URLSearchParams();
  if (!params) return query.toString();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.monitorId) query.set("monitor_id", params.monitorId);
  if (params.capability) query.set("capability", params.capability);
  if (params.severity) query.set("severity", params.severity);
  if (params.suppressed !== undefined) query.set("suppressed", String(params.suppressed));
  if (params.acknowledged !== undefined) {
    query.set("acknowledged", String(params.acknowledged));
  }
  return query.toString();
}

export async function getAlerts(
  params?: AlertQueryParams
): Promise<{ data: AlertEvent[]; meta?: MonitorListMeta }> {
  const query = buildQuery(params);
  const res = await apiClient.get<unknown>(`/alerts${query ? `?${query}` : ""}`);
  return {
    data: parseList<AlertEvent>(alertEventSchema, res.data, "alert list"),
    meta: readMeta(res as object),
  };
}

export async function getMonitorAlerts(
  monitorId: string,
  params?: Omit<AlertQueryParams, "monitorId">
): Promise<{ data: AlertEvent[]; meta?: MonitorListMeta }> {
  const query = buildQuery(params);
  const res = await apiClient.get<unknown>(
    `/monitors/${monitorId}/alerts${query ? `?${query}` : ""}`
  );
  return {
    data: parseList<AlertEvent>(alertEventSchema, res.data, "monitor alert list"),
    meta: readMeta(res as object),
  };
}

export async function acknowledgeAlert(alertId: string): Promise<AlertEvent> {
  const { data } = await apiClient.patch<unknown>(`/alerts/${alertId}/acknowledge`);
  return parseSingle<AlertEvent>(alertEventSchema, data, "acknowledged alert");
}
