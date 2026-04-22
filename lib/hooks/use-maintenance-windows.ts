import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as maintenanceWindowsApi from "@/lib/api/maintenance-windows";
import { monitorKeys } from "@/lib/hooks/use-monitors";
import type {
  MaintenanceWindowCreateInput,
  MaintenanceWindowUpdateInput,
} from "@/shared/schemas/monitor";

export const maintenanceWindowKeys = {
  all: ["maintenance-windows"] as const,
  list: (params?: maintenanceWindowsApi.ListMaintenanceWindowsParams) =>
    [...maintenanceWindowKeys.all, "list", params ?? {}] as const,
  active: (monitorId: string) =>
    [...monitorKeys.detail(monitorId), "active-maintenance-windows"] as const,
};

export function useMaintenanceWindows(
  params?: maintenanceWindowsApi.ListMaintenanceWindowsParams,
) {
  return useQuery({
    queryKey: maintenanceWindowKeys.list(params),
    queryFn: () => maintenanceWindowsApi.listMaintenanceWindows(params),
    staleTime: 30_000,
  });
}

export function useActiveMaintenanceWindows(monitorId: string) {
  return useQuery({
    queryKey: maintenanceWindowKeys.active(monitorId),
    queryFn: () =>
      maintenanceWindowsApi.getActiveMaintenanceWindows(monitorId),
    enabled: Boolean(monitorId),
    // Active windows are time-sensitive — refresh every 60s so the banner
    // disappears soon after the window ends without forcing a manual reload.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCreateMaintenanceWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MaintenanceWindowCreateInput) =>
      maintenanceWindowsApi.createMaintenanceWindow(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: maintenanceWindowKeys.all });
    },
  });
}

export function useUpdateMaintenanceWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: MaintenanceWindowUpdateInput;
    }) => maintenanceWindowsApi.updateMaintenanceWindow(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: maintenanceWindowKeys.all });
    },
  });
}

export function useDeleteMaintenanceWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      maintenanceWindowsApi.deleteMaintenanceWindow(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: maintenanceWindowKeys.all });
    },
  });
}
