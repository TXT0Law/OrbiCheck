import { useQuery } from "@tanstack/react-query";

import { getScanFindingEvidence } from "@/lib/api/scans";

const FINDING_EVIDENCE_STALE_MS = 30_000;

export function useScanFindingEvidence(
  scanId: string,
  ruleId: string,
  scanStartedAt: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["scan-findings", scanId, scanStartedAt ?? "", ruleId, "evidence"],
    queryFn: () => getScanFindingEvidence(scanId, ruleId),
    enabled,
    staleTime: FINDING_EVIDENCE_STALE_MS,
    retry: 1,
  });
}
