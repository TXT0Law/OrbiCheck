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
import { useMonitorChecks } from "@/lib/hooks/use-monitors";

interface MonitorSslExpiryChartProps {
  monitorId: string;
}

export function MonitorSslExpiryChart({ monitorId }: MonitorSslExpiryChartProps) {
  const { data, isLoading } = useMonitorChecks(monitorId, { limit: 48 });

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  const rows = [...(data?.data ?? [])]
    .reverse()
    .map((c) => ({
      t: c.checkedAt,
      days: c.sslDaysRemaining,
    }))
    .filter((p) => p.days != null);

  const chartData = rows.map((p) => ({
    checkedAt: p.t,
    daysRemaining: p.days as number,
  }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Days remaining (trend)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No SSL samples in recent checks yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-zinc-200 dark:border-zinc-700">
      <CardHeader>
        <CardTitle className="text-base font-bold">Days remaining (recent checks)</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-current">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis
              dataKey="checkedAt"
              tickFormatter={(iso) => new Date(iso).toLocaleDateString()}
              fontSize={11}
              stroke="currentColor"
              tick={{ fill: "currentColor" }}
            />
            <YAxis
              fontSize={12}
              stroke="currentColor"
              tick={{ fill: "currentColor" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(24, 24, 27, 0.96)",
                border: "2px solid rgb(82, 82, 91)",
                borderRadius: "8px",
              }}
              labelFormatter={(iso) => new Date(iso as string).toLocaleString()}
            />
            <Line type="monotone" dataKey="daysRemaining" stroke="#d97706" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
