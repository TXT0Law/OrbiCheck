import { apiClient } from "./client";
import { parseList, parseSingle } from "./_validate";
import {
  maintenanceWindowSchema,
  type MaintenanceWindowCreateInput,
  type MaintenanceWindowUpdateInput,
} from "@/shared/schemas/monitor";
import type { MaintenanceWindow } from "@/shared/types/monitor";

const BASE = "/maintenance-windows";

export interface ListMaintenanceWindowsParams {
  monitorId?: string;
  includeDisabled?: boolean;
}

export async function listMaintenanceWindows(
  params?: ListMaintenanceWindowsParams,
): Promise<MaintenanceWindow[]> {
  const query = new URLSearchParams();
  if (params?.monitorId) query.set("monitorId", params.monitorId);
  if (params?.includeDisabled !== undefined) {
    query.set("includeDisabled", params.includeDisabled ? "true" : "false");
  }
  const qs = query.toString();
  const path = qs ? `${BASE}?${qs}` : BASE;
  const { data } = await apiClient.get<unknown>(path);
  return parseList<MaintenanceWindow>(
    maintenanceWindowSchema,
    data,
    "maintenance windows",
  );
}

export async function createMaintenanceWindow(
  payload: MaintenanceWindowCreateInput,
): Promise<MaintenanceWindow> {
  const { data } = await apiClient.post<unknown>(BASE, payload);
  return parseSingle<MaintenanceWindow>(
    maintenanceWindowSchema,
    data,
    "create maintenance window",
  );
}

export async function updateMaintenanceWindow(
  id: string,
  payload: MaintenanceWindowUpdateInput,
): Promise<MaintenanceWindow> {
  const { data } = await apiClient.patch<unknown>(`${BASE}/${id}`, payload);
  return parseSingle<MaintenanceWindow>(
    maintenanceWindowSchema,
    data,
    "update maintenance window",
  );
}

export async function deleteMaintenanceWindow(id: string): Promise<void> {
  await apiClient.delete<unknown>(`${BASE}/${id}`);
}

export async function getActiveMaintenanceWindows(
  monitorId: string,
): Promise<MaintenanceWindow[]> {
  const { data } = await apiClient.get<unknown>(
    `/monitors/${monitorId}/maintenance/active`,
  );
  return parseList<MaintenanceWindow>(
    maintenanceWindowSchema,
    data,
    "active maintenance windows",
  );
}
