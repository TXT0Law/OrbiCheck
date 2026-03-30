"use client";

import { HstsDetail } from "@/components/scan/details/hsts-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanHstsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.hsts)) {
    return <SectionSkeleton />;
  }

  if (detail.hsts == null) {
    return <p className="text-sm text-muted-foreground">HSTS data unavailable for this scan.</p>;
  }

  return <HstsDetail data={detail.hsts} />;
}
