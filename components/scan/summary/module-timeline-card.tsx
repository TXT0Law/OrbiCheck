"use client";

/**
 * Module execution timeline panel: pairs the module status donut with the
 * top-N duration bar chart and embeds the existing detailed jobs summary as a
 * collapsible appendix.
 *
 * Phase 1 visualisation; the previous flat list (`ModuleJobsSummary`) is kept
 * inside the same card so users can still drill into per-module retry / error
 * controls without losing the new at-a-glance charts.
 */

import { ModuleDurationChart } from "@/components/scan/charts/module-duration-chart";
import { ModuleStatusChart } from "@/components/scan/charts/module-status-chart";
import { ModuleJobsSummary } from "@/components/scan/module-jobs-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleJob, ScanDetail } from "@/shared/types/scan";

export interface ModuleTimelineCardProps {
  detail: ScanDetail;
}

const RUNNING_STATUSES: ReadonlyArray<ScanDetail["status"]> = [
  "pending",
  "running",
];

function durationEmptyMessage(
  status: ScanDetail["status"],
  jobs: ModuleJob[] | undefined,
): string {
  if (RUNNING_STATUSES.includes(status)) {
    return "Modules are still running — top durations appear as jobs finish.";
  }
  if (!jobs || jobs.length === 0) {
    return "No module timing data was recorded for this scan.";
  }
  return "All modules finished instantly — nothing to show on the duration bar.";
}

function statusEmptyMessage(
  status: ScanDetail["status"],
  jobs: ModuleJob[] | undefined,
): string {
  if (RUNNING_STATUSES.includes(status)) {
    return "Outcome donut populates as modules report results.";
  }
  if (!jobs || jobs.length === 0) {
    return "No module job data was recorded for this scan.";
  }
  return "Module outcomes were not classified — see the appendix below for raw job rows.";
}

export function ModuleTimelineCard({ detail }: ModuleTimelineCardProps) {
  const jobs = detail.moduleJobs ?? [];
  const totalDurationMs = detail.totalDurationMs ?? 0;

  return (
    <Card data-testid="module-timeline-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Module Execution Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Slowest modules
            </p>
            <ModuleDurationChart
              data={jobs}
              emptyMessage={durationEmptyMessage(detail.status, jobs)}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Outcome distribution
            </p>
            <ModuleStatusChart
              data={jobs}
              emptyMessage={statusEmptyMessage(detail.status, jobs)}
            />
          </div>
        </div>
        {jobs.length > 0 && (
          <ModuleJobsSummary
            scanId={detail.id}
            moduleJobs={jobs}
            totalDurationMs={totalDurationMs}
            scanStatus={detail.status}
          />
        )}
      </CardContent>
    </Card>
  );
}
