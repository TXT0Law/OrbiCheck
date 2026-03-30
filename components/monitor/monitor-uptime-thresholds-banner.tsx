"use client";

import Link from "next/link";

import { Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { UptimeThresholds } from "@/shared/types/monitor";

interface MonitorUptimeThresholdsBannerProps {
  thresholds: UptimeThresholds;
  monitorId: string;
}

export function MonitorUptimeThresholdsBanner({
  thresholds,
  monitorId,
}: MonitorUptimeThresholdsBannerProps) {
  return (
    <Card className="bg-zinc-50/80 dark:bg-zinc-900/40">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-muted-foreground">Alert Thresholds:</span>
          {thresholds.maxResponseTimeMs != null ? (
            <Badge variant="outline">Max Response: {thresholds.maxResponseTimeMs}ms</Badge>
          ) : null}
          <Badge variant="outline">Consecutive Failures: {thresholds.consecutiveFailures}</Badge>
          <Badge variant="outline">
            Unexpected Status: {thresholds.alertOnUnexpectedStatus ? "Alert" : "Ignore"}
          </Badge>
        </div>
        <Link
          href={`/dashboard/monitor/${monitorId}/settings`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <Settings className="h-3 w-3" />
          Edit
        </Link>
      </CardContent>
    </Card>
  );
}
