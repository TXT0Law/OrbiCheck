"use client";

import { SecurityTxtDetail } from "@/components/scan/details/security-txt-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanSecurityTxtPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.securityTxt)) {
    return <SectionSkeleton />;
  }

  if (detail.securityTxt == null) {
    return <p className="text-sm text-muted-foreground">Security.txt data unavailable for this scan.</p>;
  }

  return <SecurityTxtDetail data={detail.securityTxt} />;
}
