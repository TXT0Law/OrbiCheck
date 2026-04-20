"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent, NO_VALUE_PLACEHOLDER } from "@/lib/utils/monitor-formatters";

const DEFAULT_SLO_TARGET = 99.9;
const SLO_DECIMALS = 3;

type SloState = "loading" | "no-data" | "meeting" | "missing";

interface SloStateStyles {
  headlineClass: string;
  footerClass: string;
  trackClass: string;
  fillClass: string;
  label: string;
}

const STATE_STYLES: Record<SloState, SloStateStyles> = {
  loading: {
    headlineClass: "text-zinc-500 dark:text-zinc-400",
    footerClass: "text-zinc-500 dark:text-zinc-400",
    trackClass:
      "border border-dashed border-zinc-300 bg-zinc-100 animate-pulse dark:border-zinc-700 dark:bg-zinc-800",
    fillClass: "",
    label: "Loading uptime…",
  },
  "no-data": {
    headlineClass: "text-zinc-500 dark:text-zinc-400",
    footerClass: "text-zinc-500 dark:text-zinc-400",
    trackClass:
      "border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900",
    fillClass: "",
    label: "Awaiting first check",
  },
  meeting: {
    headlineClass: "text-emerald-600 dark:text-emerald-400",
    footerClass: "text-emerald-600 dark:text-emerald-400",
    trackClass: "bg-zinc-200 dark:bg-zinc-800",
    fillClass: "bg-emerald-500",
    label: "✓ Meeting SLO target",
  },
  missing: {
    headlineClass: "text-red-600 dark:text-red-400",
    footerClass: "text-red-600 dark:text-red-400",
    trackClass: "bg-zinc-200 dark:bg-zinc-800",
    fillClass: "bg-red-500",
    label: "✗ Below SLO target",
  },
};

function deriveState(
  currentUptime: number | null,
  isLoading: boolean | undefined,
  sloTarget: number,
): SloState {
  if (isLoading) return "loading";
  if (currentUptime === null || !Number.isFinite(currentUptime)) return "no-data";
  return currentUptime >= sloTarget ? "meeting" : "missing";
}

interface MonitorSloTargetBarProps {
  currentUptime: number | null;
  period: string;
  sloTarget?: number;
  /** True while uptime data is still being fetched. Renders a neutral grey
   * "loading" state instead of the red "below SLO" colour. */
  isLoading?: boolean;
}

export function MonitorSloTargetBar({
  currentUptime,
  period,
  sloTarget = DEFAULT_SLO_TARGET,
  isLoading,
}: MonitorSloTargetBarProps) {
  const state = deriveState(currentUptime, isLoading, sloTarget);
  const styles = STATE_STYLES[state];
  const showFill = state === "meeting" || state === "missing";
  const displayUptime =
    state === "loading" || state === "no-data"
      ? NO_VALUE_PLACEHOLDER
      : formatPercent(currentUptime, SLO_DECIMALS);
  const fillWidth = showFill && currentUptime !== null
    ? `${Math.min(Math.max(currentUptime, 0), 100)}%`
    : "0%";

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">SLO Target ({period})</span>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-mono text-lg font-bold",
                styles.headlineClass,
              )}
            >
              {displayUptime}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono text-muted-foreground">{sloTarget}%</span>
          </div>
        </div>

        <div
          className={cn(
            "relative mt-4 h-3 overflow-hidden rounded-full",
            styles.trackClass,
          )}
        >
          {showFill && (
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all",
                styles.fillClass,
              )}
              style={{ width: fillWidth }}
            />
          )}
          <div
            className="absolute inset-y-0 w-0.5 bg-zinc-900/50 dark:bg-zinc-100/50"
            style={{ left: `${sloTarget}%` }}
            title={`SLO target: ${sloTarget}%`}
          />
        </div>

        <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
          <span>0%</span>
          <span className={cn("font-medium", styles.footerClass)}>{styles.label}</span>
          <span>100%</span>
        </div>
      </CardContent>
    </Card>
  );
}
