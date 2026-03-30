import { useQuery } from "@tanstack/react-query";

import { getScanDetail } from "@/lib/api/scans";

const DETAIL_POLL_MS = 3000;

/** Exported for unit tests — maps scan status to TanStack refetchInterval. */
export function scanDetailRefetchInterval(status: string | undefined): number | false {
  if (status === "pending" || status === "running") {
    return DETAIL_POLL_MS;
  }
  return false;
}

export function useScanDetail(scanId: string | undefined) {
  return useQuery({
    queryKey: ["scan-detail", scanId ?? ""],
    queryFn: () => {
      if (!scanId) {
        throw new Error("scanId is required");
      }
      return getScanDetail(scanId);
    },
    enabled: Boolean(scanId),
    staleTime: 60_000,
    retry: 2,
    refetchInterval: (query) => scanDetailRefetchInterval(query.state.data?.status),
  });
}
