import type { AlertEvent, MonitorListMeta } from "@/shared/types/monitor";

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
    return res.meta as MonitorListMeta;
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
  const res = await apiClient.get<AlertEvent[]>(`/alerts${query ? `?${query}` : ""}`);
  return {
    data: res.data,
    meta: readMeta(res as object),
  };
}

export async function getMonitorAlerts(
  monitorId: string,
  params?: Omit<AlertQueryParams, "monitorId">
): Promise<{ data: AlertEvent[]; meta?: MonitorListMeta }> {
  const query = buildQuery(params);
  const res = await apiClient.get<AlertEvent[]>(
    `/monitors/${monitorId}/alerts${query ? `?${query}` : ""}`
  );
  return {
    data: res.data,
    meta: readMeta(res as object),
  };
}

export async function acknowledgeAlert(alertId: string): Promise<AlertEvent> {
  const { data } = await apiClient.patch<AlertEvent>(`/alerts/${alertId}/acknowledge`);
  return data;
}
