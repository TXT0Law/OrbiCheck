"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorPeriod } from "@/lib/hooks/use-monitor-period";
import { useMonitorTimeSeries } from "@/lib/hooks/use-monitors";
import { formatTooltipPercent } from "@/lib/utils/monitor-formatters";

interface MonitorUptimeChartProps {
  monitorId: string;
}

function formatTick(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function MonitorUptimeChart({ monitorId }: MonitorUptimeChartProps) {
  const { period } = useMonitorPeriod();
  const { data: series, isLoading } = useMonitorTimeSeries(monitorId, period);

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  const buckets = series?.points ?? [];
  const chartData = buckets.map((p) => ({
    timestamp: p.timestamp,
    upPct: p.successRate,
  }));

  const tooltipBox = {
    backgroundColor: "rgba(24, 24, 27, 0.96)",
    border: "2px solid rgb(82, 82, 91)",
    borderRadius: "8px",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
  } as const;

  return (
    <Card className="border-2 border-zinc-200 shadow-sm dark:border-zinc-700">
      <CardHeader>
        <CardTitle className="text-base font-bold">Availability (aggregated)</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-current">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTick}
              fontSize={12}
              stroke="currentColor"
              tick={{ fill: "currentColor" }}
            />
            <YAxis
              domain={[0, 100]}
              unit="%"
              fontSize={12}
              width={48}
              stroke="currentColor"
              tick={{ fill: "currentColor" }}
            />
            <Tooltip
              contentStyle={tooltipBox}
              labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
              itemStyle={{ color: "#a7f3d0", fontWeight: 600 }}
              labelFormatter={(label) =>
                typeof label === "string" ? new Date(label).toLocaleString() : String(label)
              }
              formatter={(value) => [formatTooltipPercent(value), "Up"]}
            />
            <Area
              type="stepAfter"
              dataKey="upPct"
              stroke="hsl(142 76% 36%)"
              fill="hsl(142 76% 36% / 0.15)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
