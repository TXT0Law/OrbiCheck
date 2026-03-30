import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as alertsApi from "@/lib/api/alerts";

export const alertKeys = {
  all: ["alerts"] as const,
  lists: () => [...alertKeys.all, "list"] as const,
  list: (params: AlertQueryParams) => [...alertKeys.lists(), params] as const,
  monitorList: (monitorId: string, params: AlertQueryParams) =>
    [...alertKeys.all, "monitor", monitorId, params] as const,
};

interface AlertQueryParams {
  page?: number;
  limit?: number;
  monitorId?: string;
  capability?: string;
  severity?: "info" | "warning" | "critical";
  suppressed?: boolean;
  acknowledged?: boolean;
}

interface AlertQueryOptions {
  enabled?: boolean;
  refetchInterval?: number;
  staleTime?: number;
}

export function useAlerts(params?: AlertQueryParams, options?: AlertQueryOptions) {
  return useQuery({
    queryKey: alertKeys.list(params ?? {}),
    queryFn: () => alertsApi.getAlerts(params),
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  });
}

export function useMonitorAlerts(
  monitorId: string,
  params?: AlertQueryParams,
  options?: AlertQueryOptions
) {
  return useQuery({
    queryKey: alertKeys.monitorList(monitorId, params ?? {}),
    queryFn: () => alertsApi.getMonitorAlerts(monitorId, params),
    enabled: options?.enabled ?? Boolean(monitorId),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => alertsApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.all });
    },
  });
}
