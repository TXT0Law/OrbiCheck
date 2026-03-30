"use client";

import { ThreatsDetail } from "@/components/scan/details/threats-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanThreatsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.threats)) {
    return <SectionSkeleton />;
  }

  if (detail.threats == null) {
    return <p className="text-sm text-muted-foreground">Threats data unavailable for this scan.</p>;
  }

  return <ThreatsDetail data={detail.threats} />;
}
