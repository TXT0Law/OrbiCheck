"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorPeriod } from "@/lib/hooks/use-monitor-period";
import { useMonitorUptime } from "@/lib/hooks/use-monitors";
import {
  formatCount,
  formatMilliseconds,
  formatPercent,
} from "@/lib/utils/monitor-formatters";

interface MonitorUptimeSummaryProps {
  monitorId: string;
}

export function MonitorUptimeSummary({ monitorId }: MonitorUptimeSummaryProps) {
  const { period } = useMonitorPeriod();
  const { data, isLoading } = useMonitorUptime(monitorId, period);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const incidentsValue = Number.isFinite(data.incidents) ? data.incidents : 0;
  const cards = [
    {
      title: "Uptime",
      value: formatPercent(data.uptimePercentage),
      valueClass: "text-emerald-700 dark:text-emerald-400",
    },
    {
      title: "Avg latency",
      value: formatMilliseconds(data.avgResponseTimeMs),
      valueClass: "text-sky-700 dark:text-sky-400",
    },
    {
      title: "P95 latency",
      value: formatMilliseconds(data.p95ResponseTimeMs),
      valueClass: "text-violet-700 dark:text-violet-400",
    },
    {
      title: "Incidents",
      value: formatCount(data.incidents),
      valueClass:
        incidentsValue > 0
          ? "text-amber-700 dark:text-amber-400"
          : "text-zinc-900 dark:text-white",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card
          key={c.title}
          className="border-2 border-zinc-200 shadow-sm dark:border-zinc-700"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {c.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold tabular-nums ${c.valueClass}`}>{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
