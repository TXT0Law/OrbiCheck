"use client";

import Link from "next/link";

import { Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SslThresholds } from "@/shared/types/monitor";

interface MonitorSslThresholdsBannerProps {
  thresholds: SslThresholds;
  monitorId: string;
}

export function MonitorSslThresholdsBanner({ thresholds, monitorId }: MonitorSslThresholdsBannerProps) {
  return (
    <Card className="bg-zinc-50/80 dark:bg-zinc-900/40">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-muted-foreground">Alert Thresholds:</span>
          <Badge variant="outline" className="border-amber-300 dark:border-amber-700">
            Warn ≤ {thresholds.warnDaysRemaining} days
          </Badge>
          <Badge variant="outline" className="border-red-300 dark:border-red-800">
            Critical ≤ {thresholds.criticalDaysRemaining} days
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
