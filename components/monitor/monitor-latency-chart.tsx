"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorPeriod } from "@/lib/hooks/use-monitor-period";
import { useMonitorTimeSeries } from "@/lib/hooks/use-monitors";

interface MonitorLatencyChartProps {
  monitorId: string;
}

function formatTick(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function MonitorLatencyChart({ monitorId }: MonitorLatencyChartProps) {
  const { period } = useMonitorPeriod();
  const { data: series, isLoading } = useMonitorTimeSeries(monitorId, period);

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  const buckets = series?.points ?? [];
  const chartData = buckets.map((p) => ({
    timestamp: p.timestamp,
    responseTimeMs: p.avgResponseTime,
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
        <CardTitle className="text-base font-bold">Response time</CardTitle>
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
              itemStyle={{ color: "#93c5fd", fontWeight: 600 }}
              labelFormatter={(label) =>
                typeof label === "string" ? new Date(label).toLocaleString() : String(label)
              }
              formatter={(value) => [`${Number(value)} ms`, "Latency"]}
            />
            <Line
              type="monotone"
              dataKey="responseTimeMs"
              stroke="hsl(221 83% 53%)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
