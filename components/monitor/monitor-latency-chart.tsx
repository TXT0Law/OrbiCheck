"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorPeriod } from "@/lib/hooks/use-monitor-period";
import { useMonitorTimeSeries } from "@/lib/hooks/use-monitors";
import { formatTooltipMs } from "@/lib/utils/monitor-formatters";

interface MonitorLatencyChartProps {
  monitorId: string;
}

type LatencyMetric = "avg" | "p50" | "p95" | "p99";

const METRIC_OPTIONS: { id: LatencyMetric; label: string }[] = [
  { id: "avg", label: "Avg" },
  { id: "p50", label: "p50" },
  { id: "p95", label: "p95" },
  { id: "p99", label: "p99" },
];

const METRIC_COLOR: Record<LatencyMetric, string> = {
  avg: "hsl(221 83% 53%)",
  p50: "hsl(160 60% 45%)",
  p95: "hsl(280 65% 55%)",
  p99: "hsl(0 75% 55%)",
};

function formatTick(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function MonitorLatencyChart({ monitorId }: MonitorLatencyChartProps) {
  const { period } = useMonitorPeriod();
  const { data: series, isLoading } = useMonitorTimeSeries(monitorId, period);
  const [metric, setMetric] = useState<LatencyMetric>("avg");

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  const buckets = series?.points ?? [];
  const chartData = buckets.map((p) => {
    const value =
      metric === "p50"
        ? (p.p50ResponseTime ?? p.avgResponseTime)
        : metric === "p95"
          ? (p.p95ResponseTime ?? p.maxResponseTime)
          : metric === "p99"
            ? (p.p99ResponseTime ?? p.maxResponseTime)
            : p.avgResponseTime;
    return { timestamp: p.timestamp, responseTimeMs: value };
  });

  const tooltipBox = {
    backgroundColor: "rgba(24, 24, 27, 0.96)",
    border: "2px solid rgb(82, 82, 91)",
    borderRadius: "8px",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
  } as const;

  const activeOption =
    METRIC_OPTIONS.find((o) => o.id === metric) ?? METRIC_OPTIONS[0];

  return (
    <Card className="border-2 border-zinc-200 shadow-sm dark:border-zinc-700">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-bold">Response time</CardTitle>
        <div
          role="group"
          aria-label="Latency metric"
          className="flex items-center gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700"
        >
          {METRIC_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              size="sm"
              variant={opt.id === metric ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              aria-pressed={opt.id === metric}
              onClick={() => setMetric(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="text-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-current">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTick}
              fontSize={12}
              stroke="currentColor"
              tick={{ fill: "currentColor" }}
            />
            <YAxis
              unit="ms"
              fontSize={12}
              width={56}
              stroke="currentColor"
              tick={{ fill: "currentColor" }}
            />
            <Tooltip
              contentStyle={tooltipBox}
              labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
              itemStyle={{ color: METRIC_COLOR[metric], fontWeight: 600 }}
              labelFormatter={(label) =>
                typeof label === "string" ? new Date(label).toLocaleString() : String(label)
              }
              formatter={(value) => [formatTooltipMs(value), activeOption.label]}
            />
            <Line
              type="monotone"
              dataKey="responseTimeMs"
              stroke={METRIC_COLOR[metric]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
