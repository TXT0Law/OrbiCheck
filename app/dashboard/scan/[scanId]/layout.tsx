"use client";

import { useCallback, useMemo } from "react";
import { notFound, useParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { ModuleRetryBanner } from "@/components/scan/module-retry-banner";
import { ScanDetailProvider } from "@/components/scan/scan-detail-context";
import { ScanHeader } from "@/components/scan/scan-header";
import { SubNav } from "@/components/scan/sub-nav";
import { parseScanDetailSegment } from "@/lib/constants/scan-detail-segment-modules";
import { useScanDetail } from "@/lib/hooks/use-scan-detail";
import { useScanProgress } from "@/lib/hooks/use-scan-progress";
import { useScanStore } from "@/lib/stores/scan-store";
import { isLikelyScanNotFoundError } from "@/lib/utils/scan-detail-query";
import { shouldSubscribeDetailProgressSse } from "@/lib/utils/scan-detail-progress-sse";
import type { ScanDetailContextValue } from "@/components/scan/scan-detail-context";

interface ScanLayoutProps {
  children: React.ReactNode;
}

const LOADING_NAV_ITEM_WIDTHS = [
  "72%",
  "88%",
  "66%",
  "80%",
  "74%",
  "84%",
  "68%",
  "77%",
] as const;

export default function ScanLayout({ children }: ScanLayoutProps) {
  const params = useParams<{ scanId: string }>();
  const pathname = usePathname();
  const scanId = params.scanId;
  const queryClient = useQueryClient();
  const activeScan = useScanStore((s) => s.activeScan);
  const query = useScanDetail(scanId);

  const detail = query.data;
  const errorMessage = query.error instanceof Error ? query.error.message : "Failed to load scan detail.";
  const isNotFound = isLikelyScanNotFoundError(query.error);

  const onProgressComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["scan-detail", scanId] });
    queryClient.invalidateQueries({ queryKey: ["scans"] });
  }, [queryClient, scanId]);

  const subscribeSse =
    detail &&
    shouldSubscribeDetailProgressSse(detail.status, scanId, activeScan?.scanId ?? null);

  useScanProgress({
    scanId: subscribeSse ? scanId : null,
    onComplete: onProgressComplete,
  });

  const contextValue = useMemo((): ScanDetailContextValue | null => {
    if (!detail) {
      return null;
    }
    return {
      scanId,
      detail,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
      isNotFound,
      isFetching: query.isFetching,
      refetch: query.refetch,
    };
  }, [
    scanId,
    detail,
    query.isLoading,
    query.isError,
    query.error,
    isNotFound,
    query.isFetching,
    query.refetch,
  ]);

  if (query.isLoading) {
    return (
      <div
        aria-busy="true"
        className="min-h-screen bg-zinc-50 dark:bg-zinc-950"
      >
        <span className="sr-only">Loading scan details...</span>
        <div className="fixed inset-y-0 left-0 hidden w-[260px] border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:block">
          <div className="mb-6 h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="space-y-3">
            {LOADING_NAV_ITEM_WIDTHS.map((width) => (
              <div
                key={width}
                className="h-3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800"
                style={{ width }}
              />
            ))}
          </div>
        </div>
        <div className="md:pl-[260px]">
          <div className="space-y-6 p-4 md:p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-7 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="space-y-4">
              <div className="h-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/50" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/50" />
                <div className="h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (query.isError && !isNotFound) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 dark:bg-zinc-950 md:p-8">
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Failed to load scan detail: {errorMessage}
        </div>
      </div>
    );
  }

  if (!detail || isNotFound) {
    notFound();
    return null;
  }

  const segment = parseScanDetailSegment(pathname, scanId);

  return (
    <ScanDetailProvider value={contextValue!}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <SubNav scanId={scanId} domain={detail.domain} />
        <div className="md:pl-[260px]">
          <div className="space-y-6 p-4 md:p-8">
            <ScanHeader detail={detail} />
            {segment ? (
              <ModuleRetryBanner
                scanId={scanId}
                scanStatus={detail.status}
                segment={segment}
                moduleJobs={detail.moduleJobs}
              />
            ) : null}
            <main>{children}</main>
          </div>
        </div>
      </div>
    </ScanDetailProvider>
  );
}
