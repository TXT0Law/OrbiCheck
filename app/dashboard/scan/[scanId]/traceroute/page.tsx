"use client";

import { TracerouteDetail } from "@/components/scan/details/traceroute-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanTraceroutePage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.traceroute)) {
    return <SectionSkeleton />;
  }

  if (detail.traceroute == null) {
    return <p className="text-sm text-muted-foreground">Traceroute data unavailable for this scan.</p>;
  }

  return <TracerouteDetail data={detail.traceroute} />;
}
