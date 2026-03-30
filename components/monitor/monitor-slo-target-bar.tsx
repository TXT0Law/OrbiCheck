"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DEFAULT_SLO_TARGET = 99.9;

interface MonitorSloTargetBarProps {
  currentUptime: number | null;
  period: string;
  sloTarget?: number;
}

export function MonitorSloTargetBar({
  currentUptime,
  period,
  sloTarget = DEFAULT_SLO_TARGET,
}: MonitorSloTargetBarProps) {
  const isMeeting = currentUptime !== null && currentUptime >= sloTarget;
  const displayUptime = currentUptime?.toFixed(3) ?? "—";

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">SLO Target ({period})</span>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-mono text-lg font-bold",
                isMeeting ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}
            >
              {displayUptime}%
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono text-muted-foreground">{sloTarget}%</span>
          </div>
        </div>

        <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              isMeeting ? "bg-emerald-500" : "bg-red-500"
            )}
            style={{ width: `${Math.min(currentUptime ?? 0, 100)}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-zinc-900/50 dark:bg-zinc-100/50"
            style={{ left: `${sloTarget}%` }}
            title={`SLO target: ${sloTarget}%`}
          />
        </div>

        <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
          <span>0%</span>
          <span
            className={cn(
              "font-medium",
              isMeeting ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}
          >
            {isMeeting ? "✓ Meeting SLO target" : "✗ Below SLO target"}
          </span>
          <span>100%</span>
        </div>
      </CardContent>
    </Card>
  );
}
