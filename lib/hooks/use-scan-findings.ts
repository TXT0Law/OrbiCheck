import { useQuery } from "@tanstack/react-query";

import { getScanFindings } from "@/lib/api/scans";
import type { ScanDetail } from "@/shared/types/scan";

const FINDING_STALE_MS = 30_000;
const FINDING_PENDING_POLL_MS = 60_000;

interface ScanFindingQueryOptions {
  scanStatus?: ScanDetail["status"];
  scanStartedAt?: string | null;
}

export function useScanFindings(scanId: string | undefined, options?: ScanFindingQueryOptions) {
  return useQuery({
    queryKey: ["scan-findings", scanId ?? "", options?.scanStartedAt ?? ""],
    queryFn: () => {
      if (!scanId) {
        throw new Error("scanId is required");
      }
      return getScanFindings(scanId);
    },
    enabled: Boolean(scanId) && (options?.scanStatus === undefined || options.scanStatus === "completed"),
    staleTime: FINDING_STALE_MS,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.projectionStatus === "pending" ? FINDING_PENDING_POLL_MS : false,
  });
}
