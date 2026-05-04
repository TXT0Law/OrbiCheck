"use client";

/**
 * Single horizontal stacked bar contrasting dangerous open ports vs.
 * non-sensitive open ports.
 *
 * Pure presentation: takes the open `PortResult[]` (caller is expected to
 * pre-filter to `state === "open"`) and the set of port numbers considered
 * dangerous. Renders one stacked bar so the operator can immediately see
 * "of the open surface, how much is high risk?".
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { PortResult } from "@/shared/types/scan";

export interface DangerousPortsChartProps {
  /** Caller passes pre-filtered open ports only. */
  data: PortResult[];
  /** Set of port numbers considered high-risk (telnet, SMB, RDP, etc.). */
  dangerousPorts: Set<number>;
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

const DEFAULT_HEIGHT = 110;
const DEFAULT_EMPTY_MESSAGE =
  "No open ports — high-risk vs. routine breakdown will appear once ports are detected.";

const COLOR_DANGEROUS = "#dc2626";
const COLOR_NORMAL = "#2563eb";

interface BarRow {
  label: string;
  dangerous: number;
  normal: number;
}

function summarise(ports: PortResult[], dangerous: Set<number>): BarRow {
  let dangerousCount = 0;
  let normalCount = 0;
  for (const port of ports) {
    if (dangerous.has(port.port)) {
      dangerousCount += 1;
    } else {
      normalCount += 1;
    }
  }
  return {
    label: "Open ports",
    dangerous: dangerousCount,
    normal: normalCount,
  };
}

export function DangerousPortsChart({
  data,
  dangerousPorts,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: DangerousPortsChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Dangerous ports breakdown unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-4 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const row = summarise(data, dangerousPorts);
  const total = row.dangerous + row.normal;

  const tooltipBox = {
    backgroundColor: "rgba(24, 24, 27, 0.96)",
    border: "1px solid rgb(82, 82, 91)",
    borderRadius: "8px",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
  } as const;

  return (
    <div
      className="w-full text-muted-foreground"
      role="img"
      aria-label={`Open port risk breakdown: ${row.dangerous} dangerous, ${row.normal} routine (total ${total})`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={[row]}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <XAxis
            type="number"
            allowDecimals={false}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={100}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(rawValue, name) => {
              const value = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
              const labelText =
                name === "dangerous" ? "High-risk" : name === "normal" ? "Routine" : String(name);
              return [`${value} port${value === 1 ? "" : "s"}`, labelText];
            }}
          />
          <Bar dataKey="dangerous" stackId="open" radius={[4, 0, 0, 4]} isAnimationActive={false}>
            <Cell fill={COLOR_DANGEROUS} />
          </Bar>
          <Bar dataKey="normal" stackId="open" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <Cell fill={COLOR_NORMAL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_DANGEROUS }} />
          High-risk ({row.dangerous})
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_NORMAL }} />
          Routine ({row.normal})
        </span>
      </div>
    </div>
  );
}
