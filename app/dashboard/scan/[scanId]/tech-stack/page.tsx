"use client";

import { TechStackDetail } from "@/components/scan/details/tech-stack-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanTechStackPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.techStack)) {
    return <SectionSkeleton />;
  }

  if (detail.techStack == null) {
    return <p className="text-sm text-muted-foreground">Tech stack data unavailable for this scan.</p>;
  }

  return <TechStackDetail data={detail.techStack} />;
}
