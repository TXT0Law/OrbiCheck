"use client";

import Link from "next/link";

import { AlertTriangle, ArrowRight, CheckCircle, Clock } from "lucide-react";

import { TimeAgo } from "@/components/common/time-ago";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorIncidents } from "@/lib/hooks/use-monitors";
import { cn } from "@/lib/utils";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";
import type { MonitorIncident } from "@/shared/types/monitor";

const INCIDENT_TYPE_CONFIG = {
  downtime: {
    color: "border-red-400",
    badge: "destructive" as const,
    label: "Downtime",
  },
  ssl_warning: {
    color: "border-amber-400",
    badge: "warning" as const,
    label: "SSL Warning",
  },
  ssl_critical: {
    color: "border-red-400",
    badge: "destructive" as const,
    label: "SSL Critical",
  },
  content_change: {
    color: "border-sky-400",
    badge: "secondary" as const,
    label: "Content Changed",
  },
  degraded: {
    color: "border-amber-400",
    badge: "warning" as const,
    label: "Degraded",
  },
};

interface MonitorIncidentsTimelineProps {
  monitorId: string;
  limit?: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function MonitorIncidentsTimeline({ monitorId, limit = 5 }: MonitorIncidentsTimelineProps) {
  const { data, isLoading, error } = useMonitorIncidents(monitorId, { limit });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null;
  }

  const incidents: MonitorIncident[] = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent Incidents</CardTitle>
        {incidents.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {incidents.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            No incidents recorded. All systems nominal.
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((incident) => {
              const config = INCIDENT_TYPE_CONFIG[incident.type];
              const capConfig = CAPABILITY_CONFIG[incident.capability];
              const subRoute = capConfig?.subRoute;

              return (
                <div
                  key={incident.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md border-l-4 bg-zinc-50/80 p-3 dark:bg-zinc-900/40",
                    config.color
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">
                        {incident.title}
                      </span>
                      <Badge variant={config.badge} className="text-[10px]">
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{incident.description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <TimeAgo date={incident.startedAt} />
                      {incident.durationSeconds !== null ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(incident.durationSeconds)}
                        </span>
                      ) : null}
                      {incident.resolvedAt ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600">
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-red-600">
                          Ongoing
                        </Badge>
                      )}
                    </div>
                  </div>
                  {subRoute ? (
                    <Link
                      href={`/dashboard/monitor/${monitorId}/${subRoute}`}
                      className="shrink-0 text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
                      aria-label="Open related page"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
