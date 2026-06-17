"use client";

import { Activity, AlertTriangle, CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";

import { TimeAgo } from "@/components/common/time-ago";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { OperationalEvent } from "@/shared/types/operational-event";

interface OperationalEventsCardProps {
  title?: string;
  events: OperationalEvent[];
  isLoading?: boolean;
  error?: unknown;
  emptyMessage?: string;
}

function eventLabel(value: string): string {
  return value
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" / ");
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed" || status === "dead") return "destructive";
  if (status === "succeeded" || status === "completed") return "secondary";
  return "outline";
}

function EventIcon({ status }: { status: string }) {
  if (status === "failed" || status === "dead") {
    return <XCircle className="mt-0.5 h-4 w-4 text-red-600" />;
  }
  if (status === "succeeded" || status === "completed") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />;
  }
  if (status === "retrying") {
    return <RotateCcw className="mt-0.5 h-4 w-4 text-amber-600" />;
  }
  if (status === "degraded" || status === "skipped") {
    return <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />;
  }
  return <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />;
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function detailSummary(event: OperationalEvent): string | null {
  const bits: string[] = [];
  if (event.errorCode) bits.push(event.errorCode);
  if (event.retryCount > 0) bits.push(`${event.retryCount} retries`);
  const duration = formatDuration(event.durationMs);
  if (duration) bits.push(duration);
  if (event.traceId) bits.push(`trace ${event.traceId.slice(0, 8)}`);
  return bits.length ? bits.join(" · ") : null;
}

export function OperationalEventsCard({
  title = "Operational Diagnostics",
  events,
  isLoading = false,
  error,
  emptyMessage = "No operational events recorded yet.",
}: OperationalEventsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load operational diagnostics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {events.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {events.length} recent event{events.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const summary = detailSummary(event);
              return (
                <div
                  key={event.id}
                  className={cn(
                    "flex gap-3 rounded-md border bg-card p-3",
                    event.status === "failed" || event.status === "dead"
                      ? "border-red-200 dark:border-red-900/70"
                      : "border-border"
                  )}
                >
                  <EventIcon status={event.status} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium capitalize text-foreground">
                        {eventLabel(event.eventType)}
                      </span>
                      <Badge variant={statusBadgeVariant(event.status)} className="text-[10px]">
                        {event.status}
                      </Badge>
                    </div>
                    {event.message ? (
                      <p className="text-xs text-muted-foreground">{event.message}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <TimeAgo date={event.createdAt} />
                      </span>
                      {event.targetUrl ? <span className="truncate">{event.targetUrl}</span> : null}
                      {summary ? <span>{summary}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
