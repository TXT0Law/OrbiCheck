"use client";

import { TlsDetail } from "@/components/scan/details/tls-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanTlsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.tls)) {
    return <SectionSkeleton />;
  }

  if (detail.tls == null) {
    return <p className="text-sm text-muted-foreground">TLS data unavailable for this scan.</p>;
  }

  return <TlsDetail data={detail.tls} />;
}
