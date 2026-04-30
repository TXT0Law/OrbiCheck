"use client";

/**
 * Reusable circular score gauge for 0-100 metrics (SVG only, no recharts).
 *
 * Extracted from `components/scan/details/quality-detail.tsx:ScoreGauge` so the
 * Summary page (security score), Quality page (Lighthouse categories), and any
 * future module page can share the same visual without duplicating SVG geometry.
 */

import { cn } from "@/lib/utils";

export type ScoreGaugeSize = "sm" | "md" | "lg";

/** Inclusive thresholds: score >= `good` → good colour, >= `warn` → warn colour. */
export interface ScoreGaugeThresholds {
  good: number;
  warn: number;
}

export interface ScoreGaugeProps {
  /** 0-100 (inclusive). `null`/`undefined` renders an em-dash placeholder. */
  score: number | null | undefined;
  /** Short label rendered under the score number (e.g. "Performance"). */
  label?: string;
  /** Visual size; affects ring diameter and font sizes. */
  size?: ScoreGaugeSize;
  /** Override automatic colour (any CSS colour). */
  color?: string;
  /** Custom good/warn thresholds; defaults to security-score buckets (70/40). */
  thresholds?: ScoreGaugeThresholds;
  /** Caption rendered under the label (small muted text). */
  caption?: string;
  /** Optional className applied to the wrapper. */
  className?: string;
}

interface SizeSpec {
  /** SVG viewBox is fixed 100x100; we scale via Tailwind w/h classes. */
  wrapperClass: string;
  ringClass: string;
  scoreClass: string;
  labelClass: string;
  captionClass: string;
}

const SIZE_SPECS: Record<ScoreGaugeSize, SizeSpec> = {
  sm: {
    wrapperClass: "gap-1",
    ringClass: "h-16 w-16",
    scoreClass: "text-lg",
    labelClass: "text-[10px]",
    captionClass: "text-[10px]",
  },
  md: {
    wrapperClass: "gap-2",
    ringClass: "h-24 w-24",
    scoreClass: "text-2xl",
    labelClass: "text-xs",
    captionClass: "text-xs",
  },
  lg: {
    wrapperClass: "gap-3",
    ringClass: "h-36 w-36",
    scoreClass: "text-4xl",
    labelClass: "text-sm",
    captionClass: "text-xs",
  },
};

const DEFAULT_THRESHOLDS: ScoreGaugeThresholds = { good: 70, warn: 40 };

const COLOR_GOOD = "#16a34a";
const COLOR_WARN = "#ca8a04";
const COLOR_DANGER = "#dc2626";
const COLOR_NEUTRAL = "#71717a";

const RADIUS = 40;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function pickColor(
  score: number | null | undefined,
  thresholds: ScoreGaugeThresholds,
  override?: string,
): string {
  if (override) return override;
  if (score === null || score === undefined || Number.isNaN(score)) return COLOR_NEUTRAL;
  if (score >= thresholds.good) return COLOR_GOOD;
  if (score >= thresholds.warn) return COLOR_WARN;
  return COLOR_DANGER;
}

function clampScore(raw: number): number {
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

export function ScoreGauge({
  score,
  label,
  size = "md",
  color,
  thresholds = DEFAULT_THRESHOLDS,
  caption,
  className,
}: ScoreGaugeProps) {
  const spec = SIZE_SPECS[size];
  const hasScore = typeof score === "number" && !Number.isNaN(score);
  const clamped = hasScore ? clampScore(score as number) : 0;
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const resolvedColor = pickColor(score, thresholds, color);
  const ariaLabel = label
    ? `${label} score: ${hasScore ? clamped : "unavailable"} out of 100`
    : `Score: ${hasScore ? clamped : "unavailable"} out of 100`;

  return (
    <div className={cn("flex flex-col items-center", spec.wrapperClass, className)}>
      <svg
        className={cn(spec.ringClass, "-rotate-90")}
        viewBox="0 0 100 100"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-zinc-200 dark:text-zinc-700"
        />
        {hasScore && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke={resolvedColor}
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        )}
      </svg>
      <div className="text-center">
        <p
          className={cn("font-bold tabular-nums", spec.scoreClass)}
          style={{ color: hasScore ? resolvedColor : undefined }}
        >
          {hasScore ? clamped : "—"}
        </p>
        {label && (
          <p className={cn("text-muted-foreground", spec.labelClass)}>{label}</p>
        )}
        {caption && (
          <p className={cn("mt-0.5 text-muted-foreground", spec.captionClass)}>
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}
