"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { TimeAgo } from "@/components/common/time-ago";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useMonitors } from "@/lib/hooks/use-monitors";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import type { MonitorStatus } from "@/shared/types/monitor";

interface MonitorHealthProps {
  className?: string;
}

const DASHBOARD_STALE_TIME = 30_000;

export function MonitorHealth({ className }: MonitorHealthProps) {
  const language = useAppearanceLanguage();
  const dashboardMessages = getDashboardMessages(language);
  const messages = dashboardMessages.overview;
  const monitorsQuery = useMonitors(
    { page: 1, limit: 100 },
    { staleTime: DASHBOARD_STALE_TIME, refetchInterval: 60_000 }
  );

  if (monitorsQuery.isLoading) {
    return <MonitorHealthSkeleton className={className} />;
  }

  if (monitorsQuery.isError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{messages.monitorHealth}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {monitorsQuery.error instanceof Error
              ? monitorsQuery.error.message
              : messages.failedToLoadMonitors}
          </p>
          <Button variant="outline" onClick={() => void monitorsQuery.refetch()}>
            {dashboardMessages.common.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const monitors = monitorsQuery.data?.data ?? [];
  if (monitors.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{messages.monitorHealth}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{messages.noMonitorsConfigured}</p>
          <Link
            href="/dashboard/monitor/new"
            className={buttonVariants({ variant: "default" })}
          >
            <Plus className="h-4 w-4" />
            {messages.addMonitor}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">{messages.monitorHealth}</CardTitle>
        <Link
          href="/dashboard/monitor"
          className="text-sm text-muted-foreground transition hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {messages.viewAllMonitors(monitors.length)}
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {monitors.slice(0, 5).map((monitor) => (
          <Link
            key={monitor.id}
            href={`/dashboard/monitor/${monitor.id}`}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(monitor.status)}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {getMonitorLabel(monitor.displayName, monitor.url)}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatUptime(monitor.uptimePercentage, messages)}</span>
                <span>{formatLatency(monitor.lastResponseTimeMs, messages)}</span>
                <span>
                  {monitor.lastCheckAt ? (
                    <TimeAgo date={monitor.lastCheckAt} live={monitor.isEnabled} />
                  ) : (
                    messages.neverChecked
                  )}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function MonitorHealthSkeleton({ className }: MonitorHealthProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).overview;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">{messages.monitorHealth}</CardTitle>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function getStatusDotClass(status: MonitorStatus) {
  if (status === "up") return "bg-emerald-500";
  if (status === "down") return "bg-red-500";
  if (status === "degraded") return "bg-amber-500";
  if (status === "paused") return "bg-zinc-400";
  return "bg-sky-500";
}

function getMonitorLabel(displayName: string, url: string) {
  try {
    return new URL(url).hostname || displayName;
  } catch {
    return displayName;
  }
}

function formatUptime(
  value: number | null,
  messages: ReturnType<typeof getDashboardMessages>["overview"],
) {
  return value !== null ? messages.uptimeValue(value.toFixed(1)) : messages.uptimeUnavailable;
}

function formatLatency(
  value: number | null,
  messages: ReturnType<typeof getDashboardMessages>["overview"],
) {
  return value !== null ? `${Math.round(value)} ms` : messages.latencyUnavailable;
}
