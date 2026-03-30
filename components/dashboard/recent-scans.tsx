"use client";

import Link from "next/link";
import { Globe } from "lucide-react";

import { TimeAgo } from "@/components/common/time-ago";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useScanList } from "@/lib/hooks/use-scan-list";
import type { ScanResponse } from "@/shared/types/api";

interface RecentScansProps {
  className?: string;
}

export function RecentScans({ className }: RecentScansProps) {
  const scansQuery = useScanList(
    { page: 1, size: 5 },
    { refetchWhenActive: true, refetchWhenActiveMs: 30_000 }
  );

  if (scansQuery.isLoading) {
    return <RecentScansSkeleton className={className} />;
  }

  if (scansQuery.isError) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-semibold">Recent Scans</CardTitle>
          <Link
            href="/dashboard/scan"
            className="text-sm text-muted-foreground transition hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {scansQuery.error instanceof Error
              ? scansQuery.error.message
              : "Failed to load scans"}
          </p>
          <button
            type="button"
            onClick={() => void scansQuery.refetch()}
            className="text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const scans = scansQuery.data?.scans ?? [];
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">Recent Scans</CardTitle>
        <Link
          href="/dashboard/scan"
          className="text-sm text-muted-foreground transition hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          View all
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        {scans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        ) : (
          scans.map((scan) => (
            <Link
              key={scan.id}
              href={`/dashboard/scan/${scan.id}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {scan.domain}
                  </span>
                  <SecurityScoreBadge securityScore={scan.securityScore} />
                  {renderStatus(scan.status)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {scan.completedModules}/{scan.totalModules} modules
                  </span>
                  <span>{formatDuration(scan)}</span>
                  <TimeAgo date={scan.createdAt} />
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RecentScansSkeleton({ className }: RecentScansProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">Recent Scans</CardTitle>
        <Skeleton className="h-4 w-14" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <Skeleton className="h-4 w-4 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SecurityScoreBadge({ securityScore }: { securityScore: number | null }) {
  const label = securityScore === null ? "—" : String(Math.round(securityScore));
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${getSecurityScoreClasses(securityScore)}`}
      aria-label={`Security score ${label}`}
    >
      {label}
    </span>
  );
}

/** Higher = better observable hardening. */
function getSecurityScoreClasses(securityScore: number | null) {
  if (securityScore === null) {
    return "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
  }
  if (securityScore >= 70) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (securityScore >= 30) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
  }
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
}

function renderStatus(status: ScanResponse["status"]) {
  if (status === "completed") {
    return <Badge variant="secondary">Completed</Badge>;
  }
  if (status === "running" || status === "pending") {
    return <Badge variant="default">Running</Badge>;
  }
  return <Badge variant="destructive">Failed</Badge>;
}

function formatDuration(scan: ScanResponse) {
  const start = scan.startedAt ?? scan.createdAt;
  const end =
    scan.completedAt ??
    (scan.status === "running" || scan.status === "pending"
      ? new Date().toISOString()
      : null);

  if (!start || !end) {
    return "Duration unavailable";
  }

  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
    return "Duration unavailable";
  }

  const totalSeconds = Math.round((endTime - startTime) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}
