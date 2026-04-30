"use client";

/**
 * Donut chart of finding counts grouped by severity (critical / high / medium / low).
 *
 * Pure presentation: takes already-aggregated `SeverityCounts` (no fetch). Used
 * on the Summary page next to the score breakdown so users see at a glance
 * which severity bands are non-empty.
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
import type { SeverityCounts } from "@/shared/types/scan";

export interface SeverityDistributionChartProps {
  data: SeverityCounts;
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface DonutSlice {
  key: keyof SeverityCounts;
  label: string;
  value: number;
  color: string;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_EMPTY_MESSAGE =
  "No findings yet — the donut will populate when prioritised issues appear.";

const SLICE_COLORS: Record<keyof SeverityCounts, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
};

const SLICE_LABELS: Record<keyof SeverityCounts, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_ORDER: Array<keyof SeverityCounts> = [
  "critical",
  "high",
  "medium",
  "low",
];

function buildSlices(data: SeverityCounts): DonutSlice[] {
  return SEVERITY_ORDER.map((key) => ({
    key,
    label: SLICE_LABELS[key],
    value: Number.isFinite(data[key]) ? Math.max(0, data[key]) : 0,
    color: SLICE_COLORS[key],
  }));
}

function totalCount(slices: DonutSlice[]): number {
  return slices.reduce((sum, slice) => sum + slice.value, 0);
}

export function SeverityDistributionChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: SeverityDistributionChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  const slices = buildSlices(data);
  const total = totalCount(slices);

  if (total === 0) {
    return (
      <div
        role="status"
        aria-label="Severity distribution unavailable"
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
      aria-label={`Severity distribution: ${slices
        .map((slice) => `${slice.label} ${slice.value}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke="none"
            isAnimationActive={false}
          >
            {slices.map((slice) => (
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
