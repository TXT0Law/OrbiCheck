"use client";

import { IpDetail } from "@/components/scan/details/ip-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanIpPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.ip)) {
    return <SectionSkeleton />;
  }

  if (detail.ip == null) {
    return <p className="text-sm text-muted-foreground">IP data unavailable for this scan.</p>;
  }

  return <IpDetail data={detail.ip} />;
}
