"use client";

import { StatusDetail } from "@/components/scan/details/status-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanStatusPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.statusCheck)) {
    return <SectionSkeleton />;
  }

  if (detail.statusCheck == null) {
    return <p className="text-sm text-muted-foreground">HTTP status data unavailable for this scan.</p>;
  }

  return <StatusDetail data={detail.statusCheck} />;
}
