"use client";

/**
 * Horizontal bar chart of the slowest scan modules (top N by duration).
 *
 * Pure presentation: takes a `ModuleJob[]` and renders the top `topN` by
 * `durationMs`. Failed/timed-out jobs are tinted distinctively so the Summary
 * page reader can spot the most expensive AND the most likely-to-fail steps.
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
import type { ModuleJob } from "@/shared/types/scan";

export interface ModuleDurationChartProps {
  data: ModuleJob[];
  /** How many modules to show; defaults to 10 (Phase 1 spec). */
  topN?: number;
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface BarRow {
  module: string;
  durationMs: number;
  status: ModuleJob["status"];
}

const DEFAULT_TOP_N = 10;
const DEFAULT_HEIGHT = 320;
const DEFAULT_EMPTY_MESSAGE =
  "No module timing data — execution timeline appears once jobs run.";

const STATUS_COLORS: Record<ModuleJob["status"], string> = {
  success: "#2563eb",
  failed: "#dc2626",
  "timed-out": "#ea580c",
  skipped: "#71717a",
};

const STATUS_LABEL: Record<ModuleJob["status"], string> = {
  success: "Success",
  failed: "Failed",
  "timed-out": "Timed out",
  skipped: "Skipped",
};

function buildRows(jobs: ModuleJob[], topN: number): BarRow[] {
  return jobs
    .filter((job) => Number.isFinite(job.durationMs) && job.durationMs > 0)
    .map((job) => ({
      module: job.module,
      durationMs: Math.max(0, job.durationMs),
      status: job.status,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, topN);
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function ModuleDurationChart({
  data,
  topN = DEFAULT_TOP_N,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: ModuleDurationChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  const rows = buildRows(data, topN);

  if (rows.length === 0) {
    return (
      <div
        role="status"
        aria-label="Module duration unavailable"
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
      className="w-full text-muted-foreground"
      role="img"
      aria-label={`Module duration chart: top ${rows.length} of ${data.length} modules by execution time`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
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
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickFormatter={(value) => formatDurationMs(Number(value))}
          />
          <YAxis
            type="category"
            dataKey="module"
            width={140}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(rawValue, _name, item) => {
              const value = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
              const status = (item?.payload as BarRow | undefined)?.status;
              const statusLabel = status ? STATUS_LABEL[status] : "—";
              return [`${formatDurationMs(value)} (${statusLabel})`, "Duration"];
            }}
          />
          <Bar dataKey="durationMs" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.module} fill={STATUS_COLORS[row.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
