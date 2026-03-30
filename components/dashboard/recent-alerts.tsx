"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { AlertDetailSheet } from "@/components/alerts/alert-detail-sheet";
import { AlertSeverityBadge } from "@/components/alerts/alert-severity-badge";
import { TimeAgo } from "@/components/common/time-ago";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useAlerts } from "@/lib/hooks/use-alerts";
import { useMonitors } from "@/lib/hooks/use-monitors";
import { getAlertContentMessages } from "@/lib/i18n/alert-content";
import type { AlertEvent } from "@/shared/types/monitor";

interface RecentAlertsProps {
  className?: string;
}

const DASHBOARD_STALE_TIME = 30_000;

export function RecentAlerts({ className }: RecentAlertsProps) {
  const lang = useAppearanceLanguage();
  const messages = getAlertContentMessages(lang);
  const [selectedAlert, setSelectedAlert] = useState<AlertEvent | null>(null);
  const alertsQuery = useAlerts(
    { page: 1, limit: 5, acknowledged: false },
    { staleTime: DASHBOARD_STALE_TIME, refetchInterval: 60_000 }
  );
  const monitorsQuery = useMonitors(
    { page: 1, limit: 100 },
    { staleTime: DASHBOARD_STALE_TIME, refetchInterval: 60_000 }
  );

  const monitorsById = useMemo(
    () =>
      Object.fromEntries(
        (monitorsQuery.data?.data ?? []).map((monitor) => [monitor.id, monitor])
      ),
    [monitorsQuery.data]
  );

  if (alertsQuery.isLoading || monitorsQuery.isLoading) {
    return <RecentAlertsSkeleton className={className} />;
  }

  if (alertsQuery.isError || monitorsQuery.isError) {
    const error = alertsQuery.error ?? monitorsQuery.error;
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error instanceof Error ? error.message : "Failed to load alerts"}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void alertsQuery.refetch();
              void monitorsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const alerts = alertsQuery.data?.data ?? [];
  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-semibold">Recent Alerts</CardTitle>
          <Link
            href="/dashboard/alerts"
            className="text-sm text-muted-foreground transition hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            View all alerts →
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              <span>No active alerts.</span>
            </div>
          ) : (
            alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => setSelectedAlert(alert)}
                className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 p-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <AlertSeverityBadge severity={alert.severity} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {alert.message}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{getMonitorLabel(alert.monitorId, monitorsById)}</span>
                    <TimeAgo date={alert.createdAt} />
                  </div>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDetailSheet
        alert={selectedAlert}
        monitor={selectedAlert ? monitorsById[selectedAlert.monitorId] : undefined}
        open={Boolean(selectedAlert)}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAlert(null);
          }
        }}
      />
    </>
  );
}

function RecentAlertsSkeleton({ className }: RecentAlertsProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">Recent Alerts</CardTitle>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function getMonitorLabel(
  monitorId: string,
  monitorsById: Record<string, { displayName: string; url: string }>
) {
  const monitor = monitorsById[monitorId];
  if (!monitor) {
    return monitorId;
  }
  try {
    return new URL(monitor.url).hostname || monitor.displayName;
  } catch {
    return monitor.displayName;
  }
}
