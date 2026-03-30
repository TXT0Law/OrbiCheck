"use client";

import { Input } from "@/components/ui/input";
import { useMonitorStore } from "@/lib/stores/monitor-store";
import type { MonitorStatus } from "@/shared/types/monitor";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "degraded", label: "Degraded" },
  { value: "paused", label: "Paused" },
  { value: "pending", label: "Pending" },
];

export function MonitorFilterBar() {
  const searchQuery = useMonitorStore((s) => s.searchQuery);
  const setSearchQuery = useMonitorStore((s) => s.setSearchQuery);
  const statusFilter = useMonitorStore((s) => s.statusFilter);
  const setStatusFilter = useMonitorStore((s) => s.setStatusFilter);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        placeholder="Search by name or URL…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-md min-h-11 border-2 border-zinc-300 text-base dark:border-zinc-600 sm:text-sm"
      />
      <select
        value={statusFilter ?? ""}
        onChange={(e) =>
          setStatusFilter(e.target.value === "" ? null : (e.target.value as MonitorStatus))
        }
        className="min-h-11 min-w-[11rem] rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
