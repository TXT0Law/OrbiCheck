"use client";

import { AlertTriangle, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ScanProgressProps {
  domain: string;
  progress: number;
  phase: string;
  detail: string;
  /** S-11: optional list of module names currently executing in this batch. */
  currentModules?: string[];
  /** S-11: true when the target appears unhealthy (>=3 module failures so far). */
  degradedTarget?: boolean;
  onCancel: () => void;
}

// S-11: cap rendered chips to keep the progress card from ballooning when
// the heavy batch dispatches all 7+ modules at once.
const MAX_VISIBLE_MODULE_CHIPS = 6;

export function ScanProgress({
  domain,
  progress,
  phase,
  detail,
  currentModules,
  degradedTarget,
  onCancel,
}: ScanProgressProps) {
  const modules = (currentModules ?? []).filter((m) => typeof m === "string" && m.length > 0);
  const visibleModules = modules.slice(0, MAX_VISIBLE_MODULE_CHIPS);
  const overflowCount = Math.max(0, modules.length - visibleModules.length);

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{domain}</span>
          </div>
          <Badge className="border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">Running</Badge>
        </div>

        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-zinc-900 transition-all duration-500 ease-out dark:bg-zinc-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-sm text-muted-foreground">{progress}%</p>
        </div>

        {visibleModules.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            data-testid="scan-progress-current-modules"
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Running:
            </span>
            {visibleModules.map((name) => (
              <Badge
                key={name}
                className="border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
              >
                {name}
              </Badge>
            ))}
            {overflowCount > 0 && (
              <Badge className="border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                +{overflowCount}
              </Badge>
            )}
          </div>
        )}

        {degradedTarget && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            data-testid="scan-progress-degraded-target"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Target site appears slow or rate-limited; OrbiCheck has reduced retries to
              avoid further pressure. Some modules may show as failed even when the
              target normally responds.
            </span>
          </div>
        )}

        <div className="flex items-end justify-between gap-3">
          <p className="text-sm text-muted-foreground">Phase: {phase} · {detail}</p>
          <Button
            type="button"
            onClick={onCancel}
            className="h-8 bg-transparent px-2 text-muted-foreground hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Stops the scan and keeps the record with partial results (does not delete history)"
          >
            Stop scan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
