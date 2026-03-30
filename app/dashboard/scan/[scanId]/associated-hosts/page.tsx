"use client";

import { AssociatedHostsDetail } from "@/components/scan/details/associated-hosts-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function AssociatedHostsPage() {
  const { detail } = useScanDetailContext();

  if (isScanModuleAwaitingData(detail.status, detail.associatedHosts)) {
    return <SectionSkeleton />;
  }

  if (!detail.associatedHosts) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Associated hosts data is unavailable for this scan.
      </p>
    );
  }

  return <AssociatedHostsDetail data={detail.associatedHosts} />;
}
