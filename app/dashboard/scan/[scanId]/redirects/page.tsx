"use client";

import { RedirectsDetail } from "@/components/scan/details/redirects-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanRedirectsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.redirects)) {
    return <SectionSkeleton />;
  }

  if (detail.redirects == null) {
    return <p className="text-sm text-muted-foreground">Redirects data unavailable for this scan.</p>;
  }

  return <RedirectsDetail data={detail.redirects} />;
}
