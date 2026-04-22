import { apiClient } from "./client";
import { parseList } from "./_validate";
import {
  monitorDnsRecordSchema,
  monitorDnsChangeSchema,
} from "@/shared/schemas/monitor";
import type {
  MonitorDnsChange,
  MonitorDnsRecord,
} from "@/shared/types/monitor";

const BASE = "/monitors";

export interface DnsListPagination {
  page?: number;
  limit?: number;
}

export async function getMonitorDnsRecords(
  monitorId: string,
): Promise<MonitorDnsRecord[]> {
  const { data } = await apiClient.get<unknown>(
    `${BASE}/${monitorId}/dns/records`,
  );
  return parseList<MonitorDnsRecord>(
    monitorDnsRecordSchema,
    data,
    "monitor DNS records",
  );
}

export async function getMonitorDnsChanges(
  monitorId: string,
  params?: DnsListPagination,
): Promise<MonitorDnsChange[]> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  const path = qs
    ? `${BASE}/${monitorId}/dns/changes?${qs}`
    : `${BASE}/${monitorId}/dns/changes`;
  const { data } = await apiClient.get<unknown>(path);
  return parseList<MonitorDnsChange>(
    monitorDnsChangeSchema,
    data,
    "monitor DNS changes",
  );
}
