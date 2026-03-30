"use client";

import { ArchivesDetail } from "@/components/scan/details/archives-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanArchivesPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.archives)) {
    return <SectionSkeleton />;
  }

  if (detail.archives == null) {
    return <p className="text-sm text-muted-foreground">Archives data unavailable for this scan.</p>;
  }

  return <ArchivesDetail data={detail.archives} />;
}
