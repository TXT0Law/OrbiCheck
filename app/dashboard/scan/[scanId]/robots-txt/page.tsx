"use client";

import { RobotsTxtDetail } from "@/components/scan/details/robots-txt-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanRobotsTxtPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.robotsTxt)) {
    return <SectionSkeleton />;
  }

  if (detail.robotsTxt == null) {
    return <p className="text-sm text-muted-foreground">Robots.txt data unavailable for this scan.</p>;
  }

  return <RobotsTxtDetail data={detail.robotsTxt} />;
}
