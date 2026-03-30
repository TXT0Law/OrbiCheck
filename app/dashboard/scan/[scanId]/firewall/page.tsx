"use client";

import { FirewallDetail } from "@/components/scan/details/firewall-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanFirewallPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.firewall)) {
    return <SectionSkeleton />;
  }

  if (detail.firewall == null) {
    return <p className="text-sm text-muted-foreground">Firewall data unavailable for this scan.</p>;
  }

  return <FirewallDetail data={detail.firewall} />;
}
