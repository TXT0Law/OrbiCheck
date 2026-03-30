"use client";

import { DnsDetail } from "@/components/scan/details/dns-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanDnsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.dns)) {
    return <SectionSkeleton />;
  }

  if (detail.dns == null) {
    return <p className="text-sm text-muted-foreground">DNS data unavailable for this scan.</p>;
  }

  return <DnsDetail data={detail.dns} />;
}
