"use client";

import Link from "next/link";
import { CalendarClock, Wrench } from "lucide-react";

import { useActiveMaintenanceWindows } from "@/lib/hooks/use-maintenance-windows";

interface MonitorActiveMaintenanceBannerProps {
  monitorId: string;
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function MonitorActiveMaintenanceBanner({
  monitorId,
}: MonitorActiveMaintenanceBannerProps) {
  const { data, isLoading, isError } = useActiveMaintenanceWindows(monitorId);

  if (isLoading || isError) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      {data.map((window) => (
        <div
          key={window.id}
          className="flex flex-wrap items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              In maintenance — {window.title}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Active until {formatTime(window.endsAt)}
              {window.suppressAlerts ? (
                <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  Alerts suppressed
                </span>
              ) : null}
              {window.suppressProbes ? (
                <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  Probes paused
                </span>
              ) : null}
            </p>
            {window.notes ? (
              <p className="mt-1 text-xs opacity-80">{window.notes}</p>
            ) : null}
          </div>
          <Link
            href="/dashboard/settings/maintenance"
            className="shrink-0 rounded-md border border-amber-400 bg-white/60 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-white dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
          >
            Manage
          </Link>
        </div>
      ))}
    </div>
  );
}
