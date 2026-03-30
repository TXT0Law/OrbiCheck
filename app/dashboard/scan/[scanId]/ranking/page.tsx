"use client";

import { RankingDetail } from "@/components/scan/details/ranking-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanRankingPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.rankingAndCarbon)) {
    return <SectionSkeleton />;
  }

  if (detail.rankingAndCarbon == null) {
    return <p className="text-sm text-muted-foreground">Ranking data unavailable for this scan.</p>;
  }

  return <RankingDetail data={detail.rankingAndCarbon} />;
}
