"use client";

import { SitemapDetail } from "@/components/scan/details/sitemap-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanSitemapPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.sitemap)) {
    return <SectionSkeleton />;
  }

  if (detail.sitemap == null) {
    return <p className="text-sm text-muted-foreground">Sitemap data unavailable for this scan.</p>;
  }

  return <SitemapDetail data={detail.sitemap} />;
}
