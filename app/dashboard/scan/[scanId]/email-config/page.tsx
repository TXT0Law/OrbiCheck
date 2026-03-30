"use client";

import { EmailConfigDetail } from "@/components/scan/details/email-config-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanEmailConfigPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.emailConfig)) {
    return <SectionSkeleton />;
  }

  if (detail.emailConfig == null) {
    return <p className="text-sm text-muted-foreground">Email config unavailable for this scan.</p>;
  }

  return <EmailConfigDetail data={detail.emailConfig} />;
}
