"use client";

import { ScreenshotDetail } from "@/components/scan/details/screenshot-detail";
import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

export default function ScanScreenshotPage() {
  const { detail } = useScanDetailContext();

  const screenshotAwaiting =
    isScanModuleAwaitingData(detail.status, detail.screenshot) &&
    detail.pageSource == null;

  return (
    <ScreenshotDetail
      screenshot={detail.screenshot}
      pageSource={detail.pageSource}
      isLoading={screenshotAwaiting}
    />
  );
}
