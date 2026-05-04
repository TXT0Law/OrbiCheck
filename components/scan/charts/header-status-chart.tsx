"use client";

/**
 * Donut chart of security header check counts grouped by status
 * (pass / fail / missing).
 *
 * Pure presentation: takes `HeaderCheck[]` and aggregates per-status counts.
 * Used on the Headers detail page so the operator can see at a glance how
 * many security headers are correctly set vs. missing/misconfigured.
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
import type { HeaderCheck } from "@/shared/types/scan";

export interface HeaderStatusChartProps {
  data: HeaderCheck[];
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface DonutSlice {
  key: HeaderCheck["status"];
  label: string;
  value: number;
  color: string;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_EMPTY_MESSAGE =
  "Header status distribution unavailable — no checklist rows were captured.";

const SLICE_COLORS: Record<HeaderCheck["status"], string> = {
  pass: "#16a34a",
  fail: "#dc2626",
  missing: "#ca8a04",
};

const SLICE_LABELS: Record<HeaderCheck["status"], string> = {
  pass: "Pass",
  fail: "Fail",
  missing: "Missing",
};

const STATUS_ORDER: Array<HeaderCheck["status"]> = ["pass", "fail", "missing"];

function buildSlices(data: HeaderCheck[]): DonutSlice[] {
  const counts: Record<HeaderCheck["status"], number> = {
    pass: 0,
    fail: 0,
    missing: 0,
  };
  for (const check of data) {
    if (check.status in counts) {
      counts[check.status] += 1;
    }
  }
  return STATUS_ORDER.map((status) => ({
    key: status,
    label: SLICE_LABELS[status],
    value: counts[status],
    color: SLICE_COLORS[status],
  }));
}

export function HeaderStatusChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: HeaderStatusChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Header status distribution unavailable"
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
        aria-label="Header status distribution empty"
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
      aria-label={`Header status distribution: ${visibleSlices
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
