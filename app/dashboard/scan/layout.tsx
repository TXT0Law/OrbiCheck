"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useScanProgress } from "@/lib/hooks/use-scan-progress";
import { useScanStore } from "@/lib/stores/scan-store";

/**
 * Shared layout for /dashboard/scan and /dashboard/scan/groups.
 * Single SSE subscription for activeScan; progress mirrored to the scan store for pages.
 */
export default function ScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const activeScan = useScanStore((s) => s.activeScan);
  const clearActiveScan = useScanStore((s) => s.clearActiveScan);
  const setActiveScanProgressFromStream = useScanStore((s) => s.setActiveScanProgressFromStream);
  const setActiveScanProgressStreamError = useScanStore((s) => s.setActiveScanProgressStreamError);

  const onComplete = useCallback(() => {
    const current = useScanStore.getState().activeScan;
    if (current) {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["url-groups"] });
      clearActiveScan();
    }
  }, [queryClient, clearActiveScan]);

  useScanProgress({
    scanId: activeScan?.scanId ?? null,
    onComplete,
    onProgress: setActiveScanProgressFromStream,
    onStreamError: setActiveScanProgressStreamError,
  });

  return <>{children}</>;
}
