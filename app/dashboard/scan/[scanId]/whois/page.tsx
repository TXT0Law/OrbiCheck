"use client";

import { WhoisDetail } from "@/components/scan/details/whois-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanWhoisPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.whois)) {
    return <SectionSkeleton />;
  }

  if (detail.whois == null) {
    return <p className="text-sm text-muted-foreground">Whois data unavailable for this scan.</p>;
  }

  return <WhoisDetail data={detail.whois} />;
}
