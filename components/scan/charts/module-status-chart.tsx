"use client";

/**
 * Donut chart of module job outcome counts (success / failed / timed-out / skipped).
 *
 * Pure presentation: aggregates a `ModuleJob[]` into per-status counts and
 * renders a donut. Empty/loading states are handled here so the Summary page
 * stays simple. Mirrors `module-duration-chart` colour scheme so visual
 * language is consistent across the timeline section.
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
import type { ModuleJob } from "@/shared/types/scan";

export interface ModuleStatusChartProps {
  data: ModuleJob[];
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface DonutSlice {
  key: ModuleJob["status"];
  label: string;
  value: number;
  color: string;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_EMPTY_MESSAGE =
  "No module run yet — outcome breakdown appears once jobs report results.";

const SLICE_COLORS: Record<ModuleJob["status"], string> = {
  success: "#16a34a",
  failed: "#dc2626",
  "timed-out": "#ea580c",
  skipped: "#71717a",
};

const SLICE_LABELS: Record<ModuleJob["status"], string> = {
  success: "Success",
  failed: "Failed",
  "timed-out": "Timed out",
  skipped: "Skipped",
};

const STATUS_ORDER: Array<ModuleJob["status"]> = [
  "success",
  "failed",
  "timed-out",
  "skipped",
];

function buildSlices(jobs: ModuleJob[]): DonutSlice[] {
  const counts: Record<ModuleJob["status"], number> = {
    success: 0,
    failed: 0,
    "timed-out": 0,
    skipped: 0,
  };
  for (const job of jobs) {
    if (job.status in counts) {
      counts[job.status] += 1;
    }
  }
  return STATUS_ORDER.map((status) => ({
    key: status,
    label: SLICE_LABELS[status],
    value: counts[status],
    color: SLICE_COLORS[status],
  }));
}

export function ModuleStatusChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: ModuleStatusChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  const slices = buildSlices(data);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <div
        role="status"
        aria-label="Module status unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const visibleSlices = slices.filter((slice) => slice.value > 0);

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
      aria-label={`Module status: ${visibleSlices
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
            formatter={(rawValue, name) => [`${typeof rawValue === "number" ? rawValue : rawValue ?? ""}`, name]}
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
