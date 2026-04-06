"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { retryModule } from "@/lib/api/scans";
import { SCAN_MODULES, type ScanModuleId } from "@/lib/constants/scan-modules";
import { getModuleDetailHref } from "@/lib/constants/scan-module-routes";
import type { ModuleJob } from "@/shared/types/scan";

const STATUS_CONFIG = {
  success: {
    icon: "✅",
    label: "success",
    color: "text-green-600 dark:text-green-400",
  },
  failed: {
    icon: "❌",
    label: "error",
    color: "text-red-600 dark:text-red-400",
  },
  "timed-out": {
    icon: "⏸️",
    label: "timed-out",
    color: "text-amber-600 dark:text-amber-400",
  },
  skipped: {
    icon: "⏭️",
    label: "skipped",
    color: "text-muted-foreground",
  },
} as const;

interface ModuleJobsSummaryProps {
  scanId: string;
  moduleJobs: ModuleJob[];
  totalDurationMs: number;
  scanStatus: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

interface ModuleJobRowProps {
  scanId: string;
  job: ModuleJob;
  scanStatus: string;
}

function moduleDetailHref(scanId: string, moduleName: string): string | null {
  if (!(SCAN_MODULES as readonly string[]).includes(moduleName)) {
    return null;
  }
  return getModuleDetailHref(scanId, moduleName as ScanModuleId);
}

function ModuleJobRow({ scanId, job, scanStatus }: ModuleJobRowProps) {
  const [showError, setShowError] = useState(false);
  const queryClient = useQueryClient();

  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.success;
  const terminalStates = ["completed", "failed", "cancelled"];
  const canRetry =
    (job.status === "failed" ||
      job.status === "timed-out" ||
      job.status === "skipped") &&
    terminalStates.includes(scanStatus);

  const hasErrorOrNote = !!job.error;

  const detailHref = moduleDetailHref(scanId, job.module);

  const retryMutation = useMutation({
    mutationFn: () => retryModule(scanId, job.module),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-detail", scanId] });
      queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
    },
    onError: (error) => {
      console.error(`Retry failed for ${job.module}:`, error);
    },
  });

  return (
    <div className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{config.icon}</span>
          <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{job.module}</span>
          {detailHref && (
            <Link
              href={detailHref}
              className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              View detail
            </Link>
          )}
          <span className={config.color}>({config.label}).</span>
          <span className="text-muted-foreground">
            Took {formatDuration(job.durationMs)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRetry && (
            <Button
              type="button"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="h-7 rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {retryMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <span className="mr-1">↻</span>
              )}
              Retry
            </Button>
          )}
          {hasErrorOrNote && (
            <Button
              type="button"
              onClick={() => setShowError(!showError)}
              className="h-7 rounded-md px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {showError ? "■ Hide Error" : "■ Show Error"}
            </Button>
          )}
        </div>
      </div>
      {showError && job.error && (
        <div className="mt-2 rounded bg-red-100 p-2 font-mono text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {job.error}
        </div>
      )}
    </div>
  );
}

export function ModuleJobsSummary({
  scanId,
  moduleJobs,
  totalDurationMs,
  scanStatus,
}: ModuleJobsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!moduleJobs || moduleJobs.length === 0) {
    return null;
  }

  const counts = moduleJobs.reduce(
    (acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const successCount = counts["success"] || 0;
  const skippedCount = counts["skipped"] || 0;
  const failedCount = (counts["failed"] || 0) + (counts["timed-out"] || 0);

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-700/30"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          {failedCount > 0 ? (
            <span>
              Some modules failed, but this page is still usable.
              <span className="ml-2 text-zinc-600 dark:text-zinc-300">
                · ✅ {successCount} successful
                {skippedCount > 0 && ` · ⏭️ ${skippedCount} skipped`}
                · ❌ {failedCount} failed
              </span>
            </span>
          ) : (
            <span>
              Finished in {formatDuration(totalDurationMs)}
              {successCount > 0 && (
                <span className="ml-2 text-zinc-600 dark:text-zinc-300">
                  · ✅ {successCount} successful
                  {skippedCount > 0 && ` · ⏭️ ${skippedCount} skipped`}
                </span>
              )}
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {isOpen ? (
            <>
              <ChevronDown className="h-4 w-4" />
              Hide Detail
            </>
          ) : (
            <>
              <ChevronRight className="h-4 w-4" />
              Show Detail
            </>
          )}
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-zinc-300 px-4 py-3 dark:border-zinc-600">
          <div className="space-y-1">
            {moduleJobs.map((job) => (
              <ModuleJobRow
                key={job.module}
                scanId={scanId}
                job={job}
                scanStatus={scanStatus}
              />
            ))}
            <div className="mt-4 space-y-1 rounded-md bg-zinc-100 p-3 text-xs text-zinc-700 dark:bg-zinc-700/30 dark:text-zinc-200">
              <p>Check the browser console for logs and more info.</p>
              <p>
                It&apos;s normal for some jobs to fail, either because the host
                doesn&apos;t return the required info, or restrictions in the
                lambda function, or hitting an API limit.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
