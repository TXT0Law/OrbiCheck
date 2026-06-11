"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useMonitors } from "@/lib/hooks/use-monitors";
import { useMonitorSSE } from "@/lib/hooks/use-monitor-sse";
import { useMonitorStore } from "@/lib/stores/monitor-store";

import { Button } from "@/components/ui/button";
import { MonitorBulkActionBar } from "./monitor-bulk-action-bar";
import { MonitorEmptyState } from "./monitor-empty-state";
import { MonitorListTable } from "./monitor-list-table";
import { MonitorListTableSkeleton } from "./monitor-list-skeleton";

const DEFAULT_PAGE = 1;
const DEFAULT_MONITOR_PAGE_SIZE = 20;
const MONITOR_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function readPositiveIntParam(
  searchParams: { get(name: string): string | null },
  key: string,
  fallback: number,
) {
  const raw = Number(searchParams.get(key));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : fallback;
}

function readPageSize(searchParams: { get(name: string): string | null }) {
  const raw = readPositiveIntParam(searchParams, "pageSize", DEFAULT_MONITOR_PAGE_SIZE);
  return MONITOR_PAGE_SIZE_OPTIONS.includes(raw as (typeof MONITOR_PAGE_SIZE_OPTIONS)[number])
    ? raw
    : DEFAULT_MONITOR_PAGE_SIZE;
}

export function MonitorListContent() {
  useMonitorSSE();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchQuery = useMonitorStore((s) => s.searchQuery);
  const statusFilter = useMonitorStore((s) => s.statusFilter);
  const tagFilters = useMonitorStore((s) => s.tagFilters);
  const tagMatch = useMonitorStore((s) => s.tagMatch);
  const latencyMaxMs = useMonitorStore((s) => s.latencyMaxMs);
  const uptimeMinPercent = useMonitorStore((s) => s.uptimeMinPercent);
  const sort = useMonitorStore((s) => s.sort);
  const selectedIds = useMonitorStore((s) => s.selectedMonitorIds);
  const setSelectedMonitorIds = useMonitorStore((s) => s.setSelectedMonitorIds);
  const page = readPositiveIntParam(searchParams, "page", DEFAULT_PAGE);
  const pageSize = readPageSize(searchParams);

  const updatePageQuery = useCallback(
    (next: { page?: number; pageSize?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextPage = next.page ?? page;
      const nextPageSize = next.pageSize ?? pageSize;

      if (nextPage <= DEFAULT_PAGE) params.delete("page");
      else params.set("page", String(nextPage));

      if (nextPageSize === DEFAULT_MONITOR_PAGE_SIZE) params.delete("pageSize");
      else params.set("pageSize", String(nextPageSize));

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [page, pageSize, pathname, router, searchParams],
  );

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        searchQuery,
        statusFilter,
        tagFilters,
        tagMatch,
        latencyMaxMs,
        uptimeMinPercent,
        sort,
      }),
    [
      latencyMaxMs,
      searchQuery,
      sort,
      statusFilter,
      tagFilters,
      tagMatch,
      uptimeMinPercent,
    ],
  );
  const previousFilterKey = useRef(filterKey);

  useEffect(() => {
    if (previousFilterKey.current === filterKey) {
      return;
    }
    previousFilterKey.current = filterKey;
    if (page !== DEFAULT_PAGE) {
      updatePageQuery({ page: DEFAULT_PAGE });
    }
  }, [filterKey, page, updatePageQuery]);

  const { data, isLoading, isError, error } = useMonitors({
    search: searchQuery || undefined,
    status: statusFilter ?? undefined,
    tags: tagFilters.length > 0 ? tagFilters : undefined,
    tagMatch: tagFilters.length > 0 ? tagMatch : undefined,
    latencyMaxMs: latencyMaxMs ?? undefined,
    uptimeMinPercent: uptimeMinPercent ?? undefined,
    sort: sort ?? undefined,
    page,
    limit: pageSize,
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const visibleIds = useMemo(() => rows.map((m) => m.id), [rows]);
  const total = data?.meta?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isOutOfRangePage = total > 0 && rows.length === 0 && page > totalPages;

  useEffect(() => {
    if (!isLoading && !isError && isOutOfRangePage) {
      updatePageQuery({ page: totalPages });
    }
  }, [isError, isLoading, isOutOfRangePage, totalPages, updatePageQuery]);

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
  if (isOutOfRangePage) {
    return (
      <p className="text-sm text-muted-foreground">
        This monitor page is empty. Redirecting to the last available page...
      </p>
    );
  }
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
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} total monitors
          </span>
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              aria-label="Monitor rows per page"
              value={pageSize}
              onChange={(event) =>
                updatePageQuery({
                  pageSize: Number(event.target.value),
                  page: DEFAULT_PAGE,
                })
              }
              className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {MONITOR_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => updatePageQuery({ page: page - 1 })}
            disabled={page <= DEFAULT_PAGE || isLoading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => updatePageQuery({ page: page + 1 })}
            disabled={page >= totalPages || isLoading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
