"use client";

import { FeaturesDetail } from "@/components/scan/details/features-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanFeaturesPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.features)) {
    return <SectionSkeleton />;
  }

  if (detail.features == null) {
    return <p className="text-sm text-muted-foreground">Features data unavailable for this scan.</p>;
  }

  return <FeaturesDetail data={detail.features} />;
}
