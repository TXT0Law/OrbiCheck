"use client";

import { SocialTagsDetail } from "@/components/scan/details/social-tags-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanSocialTagsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.socialTags)) {
    return <SectionSkeleton />;
  }

  if (detail.socialTags == null) {
    return <p className="text-sm text-muted-foreground">Social tags data unavailable for this scan.</p>;
  }

  return <SocialTagsDetail data={detail.socialTags} />;
}
