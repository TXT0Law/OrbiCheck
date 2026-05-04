"use client";

/**
 * Vertical bar chart of technology counts grouped by category
 * (CMS / JS Framework / Web Server / etc.).
 *
 * Pure presentation: takes `TechStackItem[]` and aggregates per-category
 * counts. Used on the Tech Stack detail page so users can see the breadth
 * of the fingerprinted stack at a glance before scrolling per-category cards.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { TechStackItem } from "@/shared/types/scan";

export interface TechCategoryChartProps {
  data: TechStackItem[];
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
  /** Maximum bars to render (longest categories first); defaults to 12. */
  topN?: number;
}

interface BarRow {
  category: string;
  count: number;
}

const DEFAULT_HEIGHT = 280;
const DEFAULT_TOP_N = 12;
const DEFAULT_EMPTY_MESSAGE =
  "Tech category distribution unavailable — no fingerprinted technologies returned.";

const BAR_COLOR = "#7c3aed";

function buildRows(data: TechStackItem[], topN: number): BarRow[] {
  const counts = new Map<string, number>();
  for (const item of data) {
    const category = item.category?.trim() || "Other";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function TechCategoryChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
  topN = DEFAULT_TOP_N,
}: TechCategoryChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Tech category distribution unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const rows = buildRows(data, topN);

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
      aria-label={`Tech category distribution: ${rows
        .map((row) => `${row.category} ${row.count}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 24, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <XAxis
            dataKey="category"
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(rawValue) => {
              const value = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
              return [`${value} item${value === 1 ? "" : "s"}`, "Count"];
            }}
          />
          <Bar
            dataKey="count"
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
