import { useQuery } from "@tanstack/react-query";

import * as monitorCtApi from "@/lib/api/monitor-ct";
import { monitorKeys } from "@/lib/hooks/use-monitors";

export function useMonitorCtEntries(
  monitorId: string,
  params?: { page?: number; limit?: number },
) {
  return useQuery({
    queryKey: [
      ...monitorKeys.detail(monitorId),
      "ctEntries",
      params ?? {},
    ] as const,
    queryFn: () => monitorCtApi.getMonitorCtEntries(monitorId, params),
    enabled: Boolean(monitorId),
    staleTime: 60_000,
  });
}
