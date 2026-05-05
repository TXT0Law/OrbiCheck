import { useQuery } from "@tanstack/react-query";

import { getScanDiff, getScanDomainTimeline } from "@/lib/api/scans";
import type { ScanTimelineRange } from "@/shared/types/scan";

/**
 * TanStack Query hooks for the Phase 5 trend + diff endpoints.
 *
 * Both views are derived data (no SSE); a 30 s stale time keeps the page
 * snappy without re-fetching on every focus while a user is poking at the
 * range filter.
 */

const TREND_STALE_MS = 30_000;
const DIFF_STALE_MS = 60_000;

export function useScanDomainTimeline(
  domain: string | undefined,
  options?: { range?: ScanTimelineRange; limit?: number },
) {
  const trimmedDomain = (domain ?? "").trim();
  const range = options?.range ?? "all";
  const limit = options?.limit;
  return useQuery({
    queryKey: ["scan-trend", trimmedDomain, range, limit ?? null],
    queryFn: () =>
      getScanDomainTimeline(trimmedDomain, { range, limit }),
    enabled: Boolean(trimmedDomain),
    staleTime: TREND_STALE_MS,
    retry: 1,
  });
}

export function useScanDiff(
  baseId: string | undefined,
  compareId: string | undefined,
) {
  const enabled = Boolean(baseId && compareId && baseId !== compareId);
  return useQuery({
    queryKey: ["scan-diff", baseId ?? "", compareId ?? ""],
    queryFn: () => getScanDiff(baseId as string, compareId as string),
    enabled,
    staleTime: DIFF_STALE_MS,
    retry: 1,
  });
}
