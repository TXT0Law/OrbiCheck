"use client";

/**
 * Radar chart of Lighthouse category scores
 * (Performance / Accessibility / Best Practices / SEO).
 *
 * Pure presentation: takes `QualityCategory[]` and plots their `displayScore`
 * (0-100) on a single polygon. Mirrors the `ScoreBreakdownRadar` styling so
 * the Quality detail page reads visually consistent with the Summary page.
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
import type { QualityCategory } from "@/shared/types/scan";

export interface QualityCategoryRadarProps {
  data: QualityCategory[] | null | undefined;
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface RadarPoint {
  category: string;
  score: number;
}

const DEFAULT_HEIGHT = 280;
const DEFAULT_EMPTY_MESSAGE =
  "Quality radar unavailable — no Lighthouse categories available.";

function clamp(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}

function buildPoints(data: QualityCategory[]): RadarPoint[] {
  return data.map((category) => ({
    category: category.title,
    score: clamp(Number(category.displayScore ?? 0)),
  }));
}

export function QualityCategoryRadar({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: QualityCategoryRadarProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Quality category radar unavailable"
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
      aria-label={`Quality category radar: ${points
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
            stroke="#16a34a"
            fill="#16a34a"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#bbf7d0", fontWeight: 600 }}
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
