"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorChecks } from "@/lib/hooks/use-monitors";
import { formatPercent } from "@/lib/utils/monitor-formatters";
import type { CheckErrorType } from "@/shared/types/monitor";

const ERROR_TYPE_LABELS: Record<CheckErrorType, string> = {
  timeout: "Timeout",
  dns_resolution: "DNS Error",
  connection_refused: "Connection Refused",
  ssl_error: "SSL Error",
  http_error: "HTTP Error",
  content_too_large: "Content Too Large",
  unknown: "Unknown",
};

const ERROR_TYPE_COLORS: Record<CheckErrorType, string> = {
  timeout: "bg-orange-500",
  dns_resolution: "bg-red-600",
  connection_refused: "bg-red-500",
  ssl_error: "bg-amber-500",
  http_error: "bg-yellow-500",
  content_too_large: "bg-purple-500",
  unknown: "bg-gray-500",
};

interface MonitorFailureDistributionProps {
  monitorId: string;
}

export function MonitorFailureDistribution({ monitorId }: MonitorFailureDistributionProps) {
  const { data, isLoading } = useMonitorChecks(monitorId, { limit: 200 });

  if (isLoading) {
    return <Skeleton className="h-36 w-full rounded-lg" />;
  }

  const checks = data?.data ?? [];
  const failures = checks.filter((c) => !c.success && c.errorType);

  if (failures.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failure Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No failures in recent checks.</p>
        </CardContent>
      </Card>
    );
  }

  const counts = failures.reduce<Record<string, number>>((acc, check) => {
    const key = check.errorType ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const total = failures.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Failure Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map(([type, count]) => {
          const pctNum = total > 0 ? (count / total) * 100 : 0;
          const pctLabel = formatPercent(pctNum, 1);
          const fillWidth = Number.isFinite(pctNum) ? Math.max(0, Math.min(100, pctNum)) : 0;
          const label = ERROR_TYPE_LABELS[type as CheckErrorType] ?? type;
          const color = ERROR_TYPE_COLORS[type as CheckErrorType] ?? "bg-gray-400";
          return (
            <div key={type} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-900 dark:text-white">{label}</span>
                <span className="text-muted-foreground">
                  {count} ({pctLabel})
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${fillWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
