"use client";

import { useEffect, useMemo } from "react";

import { useMonitors } from "@/lib/hooks/use-monitors";
import { useMonitorSSE } from "@/lib/hooks/use-monitor-sse";
import { useMonitorStore } from "@/lib/stores/monitor-store";

import { MonitorBulkActionBar } from "./monitor-bulk-action-bar";
import { MonitorEmptyState } from "./monitor-empty-state";
import { MonitorListTable } from "./monitor-list-table";
import { MonitorListTableSkeleton } from "./monitor-list-skeleton";

export function MonitorListContent() {
  useMonitorSSE();
  const searchQuery = useMonitorStore((s) => s.searchQuery);
  const statusFilter = useMonitorStore((s) => s.statusFilter);
  const tagFilters = useMonitorStore((s) => s.tagFilters);
  const tagMatch = useMonitorStore((s) => s.tagMatch);
  const latencyMaxMs = useMonitorStore((s) => s.latencyMaxMs);
  const uptimeMinPercent = useMonitorStore((s) => s.uptimeMinPercent);
  const sort = useMonitorStore((s) => s.sort);
  const selectedIds = useMonitorStore((s) => s.selectedMonitorIds);
  const setSelectedMonitorIds = useMonitorStore((s) => s.setSelectedMonitorIds);

  const { data, isLoading, isError, error } = useMonitors({
    search: searchQuery || undefined,
    status: statusFilter ?? undefined,
    tags: tagFilters.length > 0 ? tagFilters : undefined,
    tagMatch: tagFilters.length > 0 ? tagMatch : undefined,
    latencyMaxMs: latencyMaxMs ?? undefined,
    uptimeMinPercent: uptimeMinPercent ?? undefined,
    sort: sort ?? undefined,
    page: 1,
    limit: 50,
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const visibleIds = useMemo(() => rows.map((m) => m.id), [rows]);

  // Prune ids that are no longer visible (filter changed, monitor deleted via
  // bulk action). We compare against `visibleIds` instead of clearing on every
  // render to preserve cross-filter selection in the future if we ever add a
  // "select across pages" mode.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const visible = new Set(visibleIds);
    const next = selectedIds.filter((id) => visible.has(id));
    if (next.length !== selectedIds.length) {
      setSelectedMonitorIds(next);
    }
  }, [visibleIds, selectedIds, setSelectedMonitorIds]);

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

  const hasFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter != null ||
    tagFilters.length > 0 ||
    latencyMaxMs != null ||
    uptimeMinPercent != null;
  if (rows.length === 0 && !hasFilters) {
    return <MonitorEmptyState />;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No monitors match your filters.</p>
    );
  }

  return (
    <div className="space-y-3">
      <MonitorBulkActionBar visibleMonitorIds={visibleIds} />
      <MonitorListTable monitors={rows} />
    </div>
  );
}
