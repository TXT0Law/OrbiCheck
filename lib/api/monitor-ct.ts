import { apiClient } from "./client";
import { parseList } from "./_validate";
import { monitorCtEntrySchema } from "@/shared/schemas/monitor";
import type { MonitorCtEntry } from "@/shared/types/monitor";

const BASE = "/monitors";

export interface CtListPagination {
  page?: number;
  limit?: number;
}

export async function getMonitorCtEntries(
  monitorId: string,
  params?: CtListPagination,
): Promise<MonitorCtEntry[]> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  const path = qs
    ? `${BASE}/${monitorId}/ct/entries?${qs}`
    : `${BASE}/${monitorId}/ct/entries`;
  const { data } = await apiClient.get<unknown>(path);
  return parseList<MonitorCtEntry>(
    monitorCtEntrySchema,
    data,
    "monitor CT entries",
  );
}
