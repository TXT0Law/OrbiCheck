"use client";

import { SslDetail } from "@/components/scan/details/ssl-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanSslPage() {
  const { detail, scanId } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.ssl)) {
    return <SectionSkeleton />;
  }

  if (detail.ssl == null) {
    return <p className="text-sm text-muted-foreground">SSL data unavailable for this scan.</p>;
  }

  return <SslDetail data={detail.ssl} scanId={scanId} />;
}
