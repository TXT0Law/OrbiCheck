"use client";

import { DnssecDetail } from "@/components/scan/details/dnssec-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanDnssecPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.dnssec)) {
    return <SectionSkeleton />;
  }

  if (detail.dnssec == null) {
    return <p className="text-sm text-muted-foreground">DNSSEC data unavailable for this scan.</p>;
  }

  return <DnssecDetail data={detail.dnssec} />;
}
