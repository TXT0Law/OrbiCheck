"use client";

/**
 * Linear progress bar of remaining certificate validity (`daysRemaining`).
 *
 * Pure presentation: renders a coloured horizontal bar whose width represents
 * the share of the original validity period still remaining. Colours follow the
 * security palette (green / amber / red) so the SSL detail page conveys
 * "how soon does this need renewing?" at a glance, without relying on the
 * surrounding tabular data.
 */

import { cn } from "@/lib/utils";

export interface CertValidityProgressProps {
  /** Days left until certificate expiry. `null`/`undefined` renders the empty state. */
  daysRemaining: number | null | undefined;
  /**
   * Total validity window in days; defaults to 365 (typical Let's Encrypt /
   * commercial cert lifecycle). Used to calculate the filled fraction.
   */
  totalDays?: number;
  height?: number;
  emptyMessage?: string;
  className?: string;
}

const DEFAULT_TOTAL_DAYS = 365;
const DEFAULT_HEIGHT = 16;
const DEFAULT_EMPTY_MESSAGE =
  "Validity progress unavailable — `daysRemaining` was not reported by the SSL scan.";

/** Inclusive thresholds: > GOOD = green, > WARN = amber, ≤ WARN = red. */
const THRESHOLD_GOOD_DAYS = 30;
const THRESHOLD_WARN_DAYS = 7;

const COLOR_GOOD = "bg-emerald-500";
const COLOR_WARN = "bg-amber-500";
const COLOR_DANGER = "bg-red-600";

function pickColor(days: number): string {
  if (days > THRESHOLD_GOOD_DAYS) return COLOR_GOOD;
  if (days > THRESHOLD_WARN_DAYS) return COLOR_WARN;
  return COLOR_DANGER;
}

function clampPercent(daysRemaining: number, totalDays: number): number {
  if (totalDays <= 0) return 0;
  const ratio = daysRemaining / totalDays;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return ratio * 100;
}

function formatDaysLabel(days: number): string {
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day remaining";
  return `${days} days remaining`;
}

export function CertValidityProgress({
  daysRemaining,
  totalDays = DEFAULT_TOTAL_DAYS,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  className,
}: CertValidityProgressProps) {
  if (daysRemaining == null || !Number.isFinite(daysRemaining)) {
    return (
      <div
        role="status"
        aria-label="Certificate validity progress unavailable"
        className={cn(
          "flex w-full items-center justify-center rounded-md border border-dashed border-zinc-200 px-3 py-2 text-sm text-muted-foreground dark:border-zinc-700",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  const safeDays = Math.max(0, daysRemaining);
  const percent = clampPercent(safeDays, totalDays);
  const fillColor = pickColor(safeDays);
  const label = formatDaysLabel(safeDays);

  return (
    <div
      className={cn("w-full space-y-1", className)}
      role="img"
      aria-label={`Certificate validity: ${label} (${Math.round(percent)}% of window)`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(percent)}% of {totalDays}d window
        </span>
      </div>
      <div
        className="w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        style={{ height }}
      >
        <div
          className={cn("h-full transition-all duration-500", fillColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
