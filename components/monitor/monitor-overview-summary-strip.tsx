"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Clock,
  FileCode,
  Gauge,
  Shield,
  Timer,
} from "lucide-react";

import { TimeAgo } from "@/components/common/time-ago";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatIntervalSeconds,
  formatMilliseconds,
  formatPercent,
  NO_VALUE_PLACEHOLDER,
} from "@/lib/utils/monitor-formatters";

import { useMonitorDetail } from "./monitor-detail-context";
import { MonitorStatusBadge } from "./monitor-status-badge";

interface MetricItemProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subtext?: string;
}

function MetricItem({ icon, label, value, subtext }: MetricItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-xs leading-none text-muted-foreground">{label}</p>
        <div className="text-sm font-semibold leading-snug text-zinc-900 dark:text-white">{value}</div>
        {subtext ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{subtext}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MonitorOverviewSummaryStrip() {
  const { monitor } = useMonitorDetail();

  const uptimeDisplay = formatPercent(monitor.uptimePercentage);
  const latencyDisplay = formatMilliseconds(monitor.avgResponseTimeMs);
  const sslDisplay =
    typeof monitor.sslExpiryDays === "number" && Number.isFinite(monitor.sslExpiryDays)
      ? `${monitor.sslExpiryDays} days`
      : NO_VALUE_PLACEHOLDER;
  const intervalDisplay = formatIntervalSeconds(monitor.intervalSeconds);

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="flex items-center gap-3">
            <span className="text-xs leading-none text-muted-foreground">Status</span>
            <MonitorStatusBadge status={monitor.status} />
          </div>

          <MetricItem
            icon={<Activity className="h-4 w-4 text-emerald-600" />}
            label="Uptime"
            value={uptimeDisplay}
          />

          <MetricItem
            icon={<Gauge className="h-4 w-4 text-sky-600" />}
            label="Avg Latency"
            value={latencyDisplay}
          />

          {monitor.enabledCapabilities.includes("ssl_expiry") ? (
            <MetricItem
              icon={<Shield className="h-4 w-4 text-amber-600" />}
              label="SSL Expiry"
              value={sslDisplay}
            />
          ) : null}

          {monitor.enabledCapabilities.includes("content_change") ? (
          <MetricItem
            icon={<FileCode className="h-4 w-4 text-violet-600" />}
            label="Last Change"
            value={
                monitor.lastChangeDetectedAt ? (
                  <TimeAgo date={monitor.lastChangeDetectedAt} live={monitor.isEnabled} />
                ) : (
                  "No changes"
                )
              }
            />
          ) : null}

          <MetricItem
            icon={<Timer className="h-4 w-4 text-muted-foreground" />}
            label="Interval"
            value={intervalDisplay}
          />

          <MetricItem
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            label="Last Check"
            value={
              monitor.lastCheckAt ? (
                <TimeAgo date={monitor.lastCheckAt} live={monitor.isEnabled} />
              ) : (
                "Never"
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
