"use client";

/**
 * Radar chart of the V2 security score breakdown's five category dimensions.
 *
 * Pure presentation: takes `SecurityScoreBreakdown.categoryScores` (camelCase
 * shape, single source of truth in `shared/types/scan.ts`). Surfaces the
 * weakest category at a glance — the page that consumes it can pair this with
 * the headline score gauge.
 */

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { SecurityScoreBreakdown } from "@/shared/types/scan";

export interface ScoreBreakdownRadarProps {
  data: SecurityScoreBreakdown["categoryScores"] | null | undefined;
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

const DEFAULT_HEIGHT = 280;
const DEFAULT_EMPTY_MESSAGE =
  "Score breakdown unavailable — the radar appears once category sub-scores are computed.";

const CATEGORY_LABELS: Record<keyof SecurityScoreBreakdown["categoryScores"], string> = {
  transport: "Transport",
  httpSecurity: "HTTP Security",
  threatIntel: "Threat Intel",
  infrastructure: "Infrastructure",
  bestPractices: "Best Practices",
};

const CATEGORY_ORDER: Array<keyof SecurityScoreBreakdown["categoryScores"]> = [
  "transport",
  "httpSecurity",
  "threatIntel",
  "infrastructure",
  "bestPractices",
];

interface RadarPoint {
  category: string;
  score: number;
}

function clamp01(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

function buildPoints(data: SecurityScoreBreakdown["categoryScores"]): RadarPoint[] {
  return CATEGORY_ORDER.map((key) => ({
    category: CATEGORY_LABELS[key],
    score: clamp01(Number(data[key] ?? 0)),
  }));
}

export function ScoreBreakdownRadar({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: ScoreBreakdownRadarProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data) {
    return (
      <div
        role="status"
        aria-label="Score breakdown unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const points = buildPoints(data);

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
      aria-label={`Score breakdown: ${points
        .map((p) => `${p.category} ${Math.round(p.score)}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={points}>
          <PolarGrid className="stroke-zinc-300 dark:stroke-zinc-700" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: "currentColor", fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "currentColor", fontSize: 10 }}
            stroke="currentColor"
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#2563eb"
            fill="#2563eb"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#bfdbfe", fontWeight: 600 }}
            formatter={(rawValue) => {
              const value = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
              return [`${Math.round(value)}/100`, "Score"];
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
