"use client";

/**
 * Phase 5 / T5.1 — Same-domain trend chart.
 *
 * Renders two stacked LineCharts for a domain timeline:
 *   1. Security score over time (0–100)
 *   2. Total severity counts over time (sum of critical+high+medium+low)
 *
 * Pure presentation: takes already-fetched ``ScanTimelinePoint[]`` so it can
 * be re-rendered cheaply when the user toggles the time range. Empty / loading
 * states are owned by this component so the page is just a thin wrapper.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { ScanTimelinePoint, SeverityCounts } from "@/shared/types/scan";

export interface ScanTrendChartProps {
  data: ScanTimelinePoint[];
  height?: number;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Min unique points needed before drawing a line; below this we show a hint. */
  minPointsForTrend?: number;
}

interface ChartRow {
  scanId: string;
  /** ISO label used both for tooltip and X-axis tick. */
  completedAt: string;
  securityScore: number | null;
  totalSeverity: number;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_MIN_POINTS = 2;
const DEFAULT_EMPTY_MESSAGE =
  "No completed scans for this domain yet — run a scan to populate the trend.";
const SINGLE_POINT_MESSAGE = "Need more scans for trend (only 1 point so far).";

const SCORE_LINE_COLOR = "#2563eb";
const SEVERITY_LINE_COLOR = "#dc2626";

function totalSeverity(severity: SeverityCounts | undefined): number {
  if (!severity) return 0;
  return (
    Math.max(0, severity.critical || 0) +
    Math.max(0, severity.high || 0) +
    Math.max(0, severity.medium || 0) +
    Math.max(0, severity.low || 0)
  );
}

function buildRows(points: ScanTimelinePoint[]): ChartRow[] {
  return points
    .filter((p) => p.completedAt)
    .map((p) => ({
      scanId: p.scanId,
      completedAt: p.completedAt as string,
      securityScore:
        typeof p.securityScore === "number" ? p.securityScore : null,
      totalSeverity: totalSeverity(p.severity),
    }));
}

function formatTick(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTooltipLabel(label: unknown): string {
  if (typeof label !== "string") return String(label ?? "");
  const d = new Date(label);
  if (Number.isNaN(d.getTime())) return label;
  return d.toLocaleString();
}

const TOOLTIP_BOX = {
  backgroundColor: "rgba(24, 24, 27, 0.96)",
  border: "1px solid rgb(82, 82, 91)",
  borderRadius: "8px",
  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
} as const;

export function ScanTrendChart({
  data,
  height = DEFAULT_HEIGHT,
  isLoading = false,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  minPointsForTrend = DEFAULT_MIN_POINTS,
}: ScanTrendChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height: height * 2 + 24 }} />;
  }

  const rows = buildRows(data);

  if (rows.length === 0) {
    return (
      <div
        role="status"
        aria-label="Scan trend unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  if (rows.length < minPointsForTrend) {
    return (
      <div
        role="status"
        aria-label="Insufficient data for scan trend"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{SINGLE_POINT_MESSAGE}</p>
      </div>
    );
  }

  const ariaLabel = `Trend over ${rows.length} scans`;

  return (
    <div
      className="flex w-full flex-col gap-6 text-muted-foreground"
      role="img"
      aria-label={ariaLabel}
    >
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          Security score
        </p>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-zinc-200 dark:stroke-zinc-700"
            />
            <XAxis
              dataKey="completedAt"
              stroke="currentColor"
              tick={{ fill: "currentColor", fontSize: 11 }}
              tickFormatter={formatTick}
            />
            <YAxis
              domain={[0, 100]}
              stroke="currentColor"
              tick={{ fill: "currentColor", fontSize: 11 }}
              width={40}
            />
            <Tooltip
              contentStyle={TOOLTIP_BOX}
              labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
              itemStyle={{ color: "#bfdbfe", fontWeight: 600 }}
              labelFormatter={formatTooltipLabel}
              formatter={(rawValue) => {
                const numeric =
                  typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
                return [Number.isNaN(numeric) ? "—" : numeric, "Score"];
              }}
            />
            <Line
              type="monotone"
              dataKey="securityScore"
              stroke={SCORE_LINE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: SCORE_LINE_COLOR }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          Total severity
        </p>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-zinc-200 dark:stroke-zinc-700"
            />
            <XAxis
              dataKey="completedAt"
              stroke="currentColor"
              tick={{ fill: "currentColor", fontSize: 11 }}
              tickFormatter={formatTick}
            />
            <YAxis
              allowDecimals={false}
              stroke="currentColor"
              tick={{ fill: "currentColor", fontSize: 11 }}
              width={32}
            />
            <Tooltip
              contentStyle={TOOLTIP_BOX}
              labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
              itemStyle={{ color: "#fecaca", fontWeight: 600 }}
              labelFormatter={formatTooltipLabel}
              formatter={(rawValue) => {
                const numeric =
                  typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
                return [
                  Number.isNaN(numeric) ? "—" : numeric,
                  "Findings (all severities)",
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="totalSeverity"
              stroke={SEVERITY_LINE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: SEVERITY_LINE_COLOR }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
