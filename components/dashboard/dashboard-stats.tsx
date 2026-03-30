"use client";

import { Activity, Bell, Search, Shield } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { useAlerts } from "@/lib/hooks/use-alerts";
import { useMonitors } from "@/lib/hooks/use-monitors";
import { useScanList } from "@/lib/hooks/use-scan-list";

interface DashboardStatsProps {
  className?: string;
}

const DASHBOARD_STALE_TIME = 30_000;
const ALERT_LIMIT = 100;

export function DashboardStats({ className }: DashboardStatsProps) {
  const scansQuery = useScanList(
    { page: 1, size: 5 },
    { refetchWhenActive: true, refetchWhenActiveMs: 30_000 }
  );
  const monitorsQuery = useMonitors(
    { page: 1, limit: 100 },
    { staleTime: DASHBOARD_STALE_TIME, refetchInterval: 60_000 }
  );
  const alertsQuery = useAlerts(
    { page: 1, limit: ALERT_LIMIT, acknowledged: false },
    { staleTime: DASHBOARD_STALE_TIME, refetchInterval: 60_000 }
  );

  const monitors = monitorsQuery.data?.data ?? [];
  const uptimeMonitors = monitors.filter(
    (monitor) =>
      monitor.enabledCapabilities.includes("uptime_only") &&
      monitor.uptimePercentage !== null
  );
  const activeMonitors = monitors.filter((monitor) => monitor.status !== "paused");
  const averageUptime = uptimeMonitors.length
    ? uptimeMonitors.reduce((sum, monitor) => sum + (monitor.uptimePercentage ?? 0), 0) /
      uptimeMonitors.length
    : null;

  const alerts = alertsQuery.data?.data ?? [];
  const activeAlerts = alertsQuery.data?.meta?.total ?? alerts.length;
  const highestSeverity = getHighestSeverity(alerts);
  const hasError =
    scansQuery.isError || monitorsQuery.isError || alertsQuery.isError;

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Search className="h-5 w-5" />}
          label="Total Scans"
          value={String(scansQuery.data?.total ?? 0)}
          href="/dashboard/scan"
          iconBgColor="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
          loading={scansQuery.isLoading}
        />
        <StatCard
          icon={<Shield className="h-5 w-5" />}
          label="Active Monitors"
          value={String(activeMonitors.length)}
          href="/dashboard/monitor"
          iconBgColor="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"
          loading={monitorsQuery.isLoading}
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Avg Uptime"
          value={averageUptime !== null ? `${averageUptime.toFixed(1)}%` : "—"}
          href="/dashboard/monitor"
          iconBgColor="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
          loading={monitorsQuery.isLoading}
        />
        <StatCard
          icon={<Bell className="h-5 w-5" />}
          label="Active Alerts"
          value={String(activeAlerts)}
          href="/dashboard/alerts"
          iconBgColor={getAlertIconClasses(highestSeverity)}
          loading={alertsQuery.isLoading}
        />
      </div>
      {hasError ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-200">
            Some dashboard stats could not be refreshed. Retry to load the latest values.
          </p>
          <div>
            <Button
              variant="outline"
              onClick={() => {
                void scansQuery.refetch();
                void monitorsQuery.refetch();
                void alertsQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getHighestSeverity(
  alerts: Array<{ severity: "info" | "warning" | "critical" }>
) {
  if (alerts.some((alert) => alert.severity === "critical")) {
    return "critical";
  }
  if (alerts.some((alert) => alert.severity === "warning")) {
    return "warning";
  }
  return "info";
}

function getAlertIconClasses(severity: "info" | "warning" | "critical") {
  if (severity === "critical") {
    return "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300";
  }
  if (severity === "warning") {
    return "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300";
}
