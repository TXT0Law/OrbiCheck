import { useQuery } from "@tanstack/react-query";

import { getScanFindings } from "@/lib/api/scans";

const FINDING_STALE_MS = 30_000;
const FINDING_PENDING_POLL_MS = 60_000;

export function useScanFindings(scanId: string | undefined) {
  return useQuery({
    queryKey: ["scan-findings", scanId ?? ""],
    queryFn: () => {
      if (!scanId) {
        throw new Error("scanId is required");
      }
      return getScanFindings(scanId);
    },
    enabled: Boolean(scanId),
    staleTime: FINDING_STALE_MS,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.projectionStatus === "pending" ? FINDING_PENDING_POLL_MS : false,
  });
}
