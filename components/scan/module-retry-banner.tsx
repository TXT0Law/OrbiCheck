"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { retryModule } from "@/lib/api/scans";
import { SCAN_DETAIL_SEGMENT_BACKEND_MODULES } from "@/lib/constants/scan-detail-segment-modules";
import type { ModuleJob, ScanDetail } from "@/shared/types/scan";

const TERMINAL_SCAN_STATUSES = ["completed", "failed", "cancelled"] as const;

interface ModuleRetryBannerProps {
  scanId: string;
  scanStatus: ScanDetail["status"];
  segment: keyof typeof SCAN_DETAIL_SEGMENT_BACKEND_MODULES;
  moduleJobs?: ModuleJob[];
}

function jobIsRetryable(job: ModuleJob, scanStatus: string): boolean {
  if (!TERMINAL_SCAN_STATUSES.includes(scanStatus as (typeof TERMINAL_SCAN_STATUSES)[number])) {
    return false;
  }
  return job.status === "failed" || job.status === "timed-out" || job.status === "skipped";
}

export function ModuleRetryBanner({
  scanId,
  scanStatus,
  segment,
  moduleJobs,
}: ModuleRetryBannerProps) {
  const queryClient = useQueryClient();
  const backendModules = SCAN_DETAIL_SEGMENT_BACKEND_MODULES[segment];
  const backendSet = useMemo(() => new Set<string>(backendModules), [backendModules]);

  const jobs = useMemo(() => {
    if (!moduleJobs?.length) {
      return [];
    }
    return moduleJobs.filter((j) => backendSet.has(j.module) && jobIsRetryable(j, scanStatus));
  }, [moduleJobs, backendSet, scanStatus]);

  const retryAllMutation = useMutation({
    mutationFn: async () => {
      for (const job of jobs) {
        await retryModule(scanId, job.module);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-detail", scanId] });
      queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
    },
    onError: (error) => {
      console.error("Module retry (batch) failed:", error);
    },
  });

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Module retry"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          One or more checks for this section did not complete successfully. You can retry without
          leaving this page.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 border-amber-400 bg-white hover:bg-amber-100 dark:border-amber-700 dark:bg-zinc-900 dark:hover:bg-amber-950/60"
          disabled={retryAllMutation.isPending}
          onClick={() => retryAllMutation.mutate()}
        >
          {retryAllMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Retry {jobs.length === 1 ? "module" : "all modules here"}
        </Button>
      </div>
      <ul className="mt-2 font-mono text-xs text-amber-900/80 dark:text-amber-200/90">
        {jobs.map((j) => (
          <li key={j.module}>
            {j.module}
            {j.error ? ` — ${j.error}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
