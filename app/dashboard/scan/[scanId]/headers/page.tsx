"use client";

import { HeadersDetail } from "@/components/scan/details/headers-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanHeadersPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.headers)) {
    return <SectionSkeleton />;
  }

  if (detail.headers == null) {
    return <p className="text-sm text-muted-foreground">Headers data unavailable for this scan.</p>;
  }

  return <HeadersDetail data={detail.headers} />;
}
