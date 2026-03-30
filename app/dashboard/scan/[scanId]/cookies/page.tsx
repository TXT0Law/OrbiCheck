"use client";

import { CookiesDetail } from "@/components/scan/details/cookies-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanCookiesPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.cookies)) {
    return <SectionSkeleton />;
  }

  if (detail.cookies == null) {
    return <p className="text-sm text-muted-foreground">Cookie data unavailable for this scan.</p>;
  }

  return <CookiesDetail data={detail.cookies} />;
}
