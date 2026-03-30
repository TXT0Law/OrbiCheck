"use client";

import { LinkedPagesDetail } from "@/components/scan/details/linked-pages-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanLinkedPagesPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.linkedPages)) {
    return <SectionSkeleton />;
  }

  if (detail.linkedPages == null) {
    return <p className="text-sm text-muted-foreground">Linked pages data unavailable for this scan.</p>;
  }

  return <LinkedPagesDetail data={detail.linkedPages} />;
}
