"use client";

/**
 * Donut chart of port-scan results grouped by state
 * (open / closed / filtered).
 *
 * Pure presentation: takes `PortResult[]` and aggregates per-state counts.
 * Used on the Ports detail page to give a one-glance read of the host's
 * exposure profile alongside the table-of-ports.
 */

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { PortResult } from "@/shared/types/scan";

export interface PortStateChartProps {
  data: PortResult[];
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface DonutSlice {
  key: PortResult["state"];
  label: string;
  value: number;
  color: string;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_EMPTY_MESSAGE =
  "Port state distribution unavailable — no scan entries reported.";

const SLICE_COLORS: Record<PortResult["state"], string> = {
  open: "#16a34a",
  closed: "#dc2626",
  filtered: "#ca8a04",
};

const SLICE_LABELS: Record<PortResult["state"], string> = {
  open: "Open",
  closed: "Closed",
  filtered: "Filtered",
};

const STATE_ORDER: Array<PortResult["state"]> = ["open", "closed", "filtered"];

function buildSlices(data: PortResult[]): DonutSlice[] {
  const counts: Record<PortResult["state"], number> = {
    open: 0,
    closed: 0,
    filtered: 0,
  };
  for (const port of data) {
    if (port.state in counts) {
      counts[port.state] += 1;
    }
  }
  return STATE_ORDER.map((state) => ({
    key: state,
    label: SLICE_LABELS[state],
    value: counts[state],
    color: SLICE_COLORS[state],
  }));
}

export function PortStateChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: PortStateChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Port state distribution unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const slices = buildSlices(data);
  const visibleSlices = slices.filter((slice) => slice.value > 0);

  if (visibleSlices.length === 0) {
    return (
      <div
        role="status"
        aria-label="Port state distribution empty"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const tooltipBox = {
    backgroundColor: "rgba(24, 24, 27, 0.96)",
    border: "1px solid rgb(82, 82, 91)",
    borderRadius: "8px",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
  } as const;

  return (
    <div
      className="w-full"
      role="img"
      aria-label={`Port state distribution: ${visibleSlices
        .map((slice) => `${slice.label} ${slice.value}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={visibleSlices}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke="none"
            isAnimationActive={false}
          >
            {visibleSlices.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(rawValue, name) => [
              `${typeof rawValue === "number" ? rawValue : (rawValue ?? "")}`,
              name,
            ]}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ paddingTop: 8, color: "currentColor", fontSize: 12 }}
            formatter={(value: string) => (
              <span className="text-zinc-700 dark:text-zinc-200">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
