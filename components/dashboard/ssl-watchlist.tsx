"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitors } from "@/lib/hooks/use-monitors";
import type { Monitor } from "@/shared/types/monitor";

interface SslWatchlistProps {
  className?: string;
}

const DASHBOARD_STALE_TIME = 30_000;
const MAX_SSL_WINDOW_DAYS = 90;

export function SslWatchlist({ className }: SslWatchlistProps) {
  const monitorsQuery = useMonitors(
    { page: 1, limit: 100 },
    { staleTime: DASHBOARD_STALE_TIME, refetchInterval: 60_000 }
  );

  if (monitorsQuery.isLoading) {
    return <SslWatchlistSkeleton className={className} />;
  }

  if (monitorsQuery.isError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">SSL Expiry Watchlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {monitorsQuery.error instanceof Error
              ? monitorsQuery.error.message
              : "Failed to load SSL watchlist"}
          </p>
          <Button variant="outline" onClick={() => void monitorsQuery.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sslMonitors = (monitorsQuery.data?.data ?? [])
    .filter((monitor) => monitor.enabledCapabilities.includes("ssl_expiry"))
    .sort(sortByExpiry)
    .slice(0, 5);

  if (sslMonitors.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">SSL Expiry Watchlist</CardTitle>
        <Link
          href="/dashboard/monitor"
          className="text-sm text-muted-foreground transition hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          View all monitors →
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {sslMonitors.map((monitor) => (
          <Link
            key={monitor.id}
            href={`/dashboard/monitor/${monitor.id}/ssl`}
            className="grid gap-3 rounded-lg border border-zinc-200 p-4 transition hover:bg-zinc-50 md:grid-cols-[minmax(0,1.3fr)_140px_minmax(0,1fr)_120px] md:items-center dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {getMonitorLabel(monitor)}
              </p>
              <p className="text-xs text-muted-foreground">{monitor.url}</p>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              {formatExpiryDays(monitor.sslExpiryDays)}
            </div>
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full ${getProgressClass(monitor.sslExpiryDays)}`}
                  style={{ width: `${getProgressValue(monitor.sslExpiryDays)}%` }}
                />
              </div>
            </div>
            <div>
              <Badge variant={getBadgeVariant(monitor.sslExpiryDays)}>
                {getStatusLabel(monitor.sslExpiryDays)}
              </Badge>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function SslWatchlistSkeleton({ className }: SslWatchlistProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">SSL Expiry Watchlist</CardTitle>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-[minmax(0,1.3fr)_140px_minmax(0,1fr)_120px] dark:border-zinc-800"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function sortByExpiry(left: Monitor, right: Monitor) {
  if (left.sslExpiryDays === null) return 1;
  if (right.sslExpiryDays === null) return -1;
  return left.sslExpiryDays - right.sslExpiryDays;
}

function getMonitorLabel(monitor: Monitor) {
  try {
    return new URL(monitor.url).hostname || monitor.displayName;
  } catch {
    return monitor.displayName;
  }
}

function formatExpiryDays(daysRemaining: number | null) {
  if (daysRemaining === null) return "Expiry unavailable";
  if (daysRemaining < 0) return `Expired ${Math.abs(daysRemaining)}d ago`;
  return `Expires in ${daysRemaining}d`;
}

function getProgressValue(daysRemaining: number | null) {
  if (daysRemaining === null) return 0;
  const clamped = Math.min(Math.max(daysRemaining, 0), MAX_SSL_WINDOW_DAYS);
  return Math.round((clamped / MAX_SSL_WINDOW_DAYS) * 100);
}

function getProgressClass(daysRemaining: number | null) {
  if (daysRemaining === null) return "bg-zinc-400";
  if (daysRemaining < 15) return "bg-red-500";
  if (daysRemaining <= 30) return "bg-amber-500";
  return "bg-emerald-500";
}

function getBadgeVariant(
  daysRemaining: number | null
): ComponentProps<typeof Badge>["variant"] {
  if (daysRemaining === null) return "secondary";
  if (daysRemaining <= 14) return "destructive";
  if (daysRemaining <= 30) return "warning";
  return "success";
}

function getStatusLabel(daysRemaining: number | null) {
  if (daysRemaining === null) return "Unknown";
  if (daysRemaining < 0) return "Expired";
  if (daysRemaining <= 14) return "Critical";
  if (daysRemaining <= 30) return "Warning";
  return "OK";
}
