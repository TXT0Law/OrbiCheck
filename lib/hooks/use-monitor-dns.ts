import { useQuery } from "@tanstack/react-query";

import * as monitorDnsApi from "@/lib/api/monitor-dns";
import { monitorKeys } from "@/lib/hooks/use-monitors";

export function useMonitorDnsRecords(monitorId: string) {
  return useQuery({
    queryKey: [...monitorKeys.detail(monitorId), "dnsRecords"] as const,
    queryFn: () => monitorDnsApi.getMonitorDnsRecords(monitorId),
    enabled: Boolean(monitorId),
    staleTime: 60_000,
  });
}

export function useMonitorDnsChanges(
  monitorId: string,
  params?: { page?: number; limit?: number },
) {
  return useQuery({
    queryKey: [
      ...monitorKeys.detail(monitorId),
      "dnsChanges",
      params ?? {},
    ] as const,
    queryFn: () => monitorDnsApi.getMonitorDnsChanges(monitorId, params),
    enabled: Boolean(monitorId),
    staleTime: 60_000,
  });
}
