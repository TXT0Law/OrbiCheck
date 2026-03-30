"use client";

import { QualityDetail } from "@/components/scan/details/quality-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanQualityPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.quality)) {
    return <SectionSkeleton />;
  }

  return <QualityDetail data={detail.quality ?? null} />;
}
