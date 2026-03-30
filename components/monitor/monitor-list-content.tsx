"use client";

import { useMonitors } from "@/lib/hooks/use-monitors";
import { useMonitorSSE } from "@/lib/hooks/use-monitor-sse";
import { useMonitorStore } from "@/lib/stores/monitor-store";

import { MonitorEmptyState } from "./monitor-empty-state";
import { MonitorListTable } from "./monitor-list-table";
import { MonitorListTableSkeleton } from "./monitor-list-skeleton";

export function MonitorListContent() {
  useMonitorSSE();
  const searchQuery = useMonitorStore((s) => s.searchQuery);
  const statusFilter = useMonitorStore((s) => s.statusFilter);

  const { data, isLoading, isError, error } = useMonitors({
    search: searchQuery || undefined,
    status: statusFilter ?? undefined,
    page: 1,
    limit: 50,
  });

  if (isLoading) {
    return <MonitorListTableSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {error instanceof Error ? error.message : "Failed to load monitors"}
      </div>
    );
  }

  const rows = data?.data ?? [];
  const hasFilters = Boolean(searchQuery.trim()) || statusFilter != null;
  if (rows.length === 0 && !hasFilters) {
    return <MonitorEmptyState />;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No monitors match your filters.</p>
    );
  }

  return <MonitorListTable monitors={rows} />;
}
