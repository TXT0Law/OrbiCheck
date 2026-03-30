"use client";

import { PortsDetail } from "@/components/scan/details/ports-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanPortsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.ports)) {
    return <SectionSkeleton />;
  }

  if (detail.ports == null) {
    return <p className="text-sm text-muted-foreground">Ports data unavailable for this scan.</p>;
  }

  return <PortsDetail data={detail.ports} />;
}
