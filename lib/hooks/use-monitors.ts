import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as monitorsApi from "@/lib/api/monitors";
import type { MonitorBulkAction } from "@/shared/schemas/monitor";
import type {
  Monitor,
  MonitorCreateRequest,
  MonitorListFilters,
  MonitorListMeta,
  MonitorUpdateRequest,
} from "@/shared/types/monitor";

export const monitorKeys = {
  all: ["monitors"] as const,
  lists: () => [...monitorKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...monitorKeys.lists(), filters] as const,
  details: () => [...monitorKeys.all, "detail"] as const,
  detail: (id: string) => [...monitorKeys.details(), id] as const,
  checks: (id: string, params?: Record<string, unknown>) =>
    [...monitorKeys.detail(id), "checks", params ?? {}] as const,
  series: (id: string, period: string) =>
    [...monitorKeys.detail(id), "series", period] as const,
  uptime: (id: string, period: string) =>
    [...monitorKeys.detail(id), "uptime", period] as const,
  changes: (id: string, params?: Record<string, unknown>) =>
    [...monitorKeys.detail(id), "changes", params ?? {}] as const,
  changesInfinite: (id: string, pageSize: number) =>
    [...monitorKeys.detail(id), "changes", "infinite", pageSize] as const,
  contentBaseline: (id: string) =>
    [...monitorKeys.detail(id), "contentBaseline"] as const,
  diff: (monitorId: string, changeId: string, mode: "line" | "word" = "line") =>
    [...monitorKeys.detail(monitorId), "diff", changeId, mode] as const,
  ssl: (id: string) => [...monitorKeys.detail(id), "ssl"] as const,
  incidents: (id: string, params?: Record<string, unknown>) =>
    [...monitorKeys.detail(id), "incidents", params ?? {}] as const,
  visualCaptures: (id: string, params?: Record<string, unknown>) =>
    [...monitorKeys.detail(id), "visualCaptures", params ?? {}] as const,
  visualChanges: (id: string, params?: Record<string, unknown>) =>
    [...monitorKeys.detail(id), "visualChanges", params ?? {}] as const,
};

export function useMonitors(filters?: MonitorListFilters, options?: {
  staleTime?: number;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: monitorKeys.list((filters ?? {}) as Record<string, unknown>),
    queryFn: () => monitorsApi.listMonitors(filters),
    staleTime: options?.staleTime ?? 30_000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useMonitor(id: string) {
  return useQuery({
    queryKey: monitorKeys.detail(id),
    queryFn: () => monitorsApi.getMonitor(id),
    enabled: Boolean(id),
  });
}

export function useMonitorChecks(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    period?: "24h" | "7d" | "30d" | "90d";
    success?: boolean;
    sort?: "asc" | "desc";
  }
) {
  return useQuery({
    queryKey: monitorKeys.checks(id, params),
    queryFn: () => monitorsApi.getMonitorChecks(id, params),
    enabled: Boolean(id),
  });
}

export function useMonitorTimeSeries(
  id: string,
  period: "24h" | "7d" | "30d" | "90d"
) {
  return useQuery({
    queryKey: monitorKeys.series(id, period),
    queryFn: () => monitorsApi.getMonitorTimeSeries(id, period),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
}

export function useMonitorUptime(
  id: string,
  period: "24h" | "7d" | "30d" | "90d"
) {
  return useQuery({
    queryKey: monitorKeys.uptime(id, period),
    queryFn: () => monitorsApi.getMonitorUptimeSummary(id, period),
    enabled: Boolean(id),
  });
}

export const MONITOR_CHANGES_PAGE_SIZE = 20;

export function useMonitorChanges(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    period?: "24h" | "7d" | "30d" | "90d";
    category?: "small" | "medium" | "large";
    sort?: "asc" | "desc";
  }
) {
  return useQuery({
    queryKey: monitorKeys.changes(id, params),
    queryFn: () => monitorsApi.getMonitorChanges(id, params),
    enabled: Boolean(id),
  });
}

export function useMonitorChangesInfinite(monitorId: string) {
  const pageSize = MONITOR_CHANGES_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: monitorKeys.changesInfinite(monitorId, pageSize),
    queryFn: ({ pageParam }) =>
      monitorsApi.getMonitorChanges(monitorId, {
        page: pageParam,
        limit: pageSize,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const m = lastPage.meta;
      if (!m) return undefined;
      const totalPages = Math.max(1, Math.ceil(m.total / m.limit));
      return m.page < totalPages ? m.page + 1 : undefined;
    },
    enabled: Boolean(monitorId),
  });
}

export function useMonitorContentBaseline(id: string) {
  return useQuery({
    queryKey: monitorKeys.contentBaseline(id),
    queryFn: () => monitorsApi.getMonitorContentBaseline(id),
    enabled: Boolean(id),
  });
}

export function useMonitorDiff(
  monitorId: string,
  changeId: string,
  mode: "line" | "word" = "line",
) {
  return useQuery({
    queryKey: monitorKeys.diff(monitorId, changeId, mode),
    queryFn: () => monitorsApi.getMonitorDiff(monitorId, changeId, { diff: mode }),
    enabled: Boolean(monitorId) && Boolean(changeId),
    staleTime: 0,
    gcTime: 60_000,
  });
}

export function useMonitorSsl(id: string) {
  return useQuery({
    queryKey: monitorKeys.ssl(id),
    queryFn: () => monitorsApi.getMonitorSsl(id),
    enabled: Boolean(id),
  });
}

export function useMonitorVisualCaptures(
  id: string,
  params?: { page?: number; limit?: number; period?: "24h" | "7d" | "30d" | "90d" }
) {
  return useQuery({
    queryKey: monitorKeys.visualCaptures(id, params ?? {}),
    queryFn: () => monitorsApi.getMonitorVisualCaptures(id, params),
    enabled: Boolean(id),
  });
}

export function useMonitorVisualChanges(
  id: string,
  params?: { page?: number; limit?: number; period?: "24h" | "7d" | "30d" | "90d" }
) {
  return useQuery({
    queryKey: monitorKeys.visualChanges(id, params ?? {}),
    queryFn: () => monitorsApi.getMonitorVisualChanges(id, params),
    enabled: Boolean(id),
  });
}

export function useMonitorIncidents(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: monitorKeys.incidents(id, params),
    queryFn: () => monitorsApi.getMonitorIncidents(id, params),
    enabled: Boolean(id),
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MonitorCreateRequest) => monitorsApi.createMonitor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitorKeys.lists() });
    },
  });
}

export function useUpdateMonitor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MonitorUpdateRequest) => monitorsApi.updateMonitor(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(monitorKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: monitorKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: monitorKeys.lists() });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monId: string) => monitorsApi.deleteMonitor(monId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitorKeys.lists() });
    },
  });
}

export function useToggleMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      monitorsApi.toggleMonitor(id, enabled),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(monitorKeys.detail(variables.id), updated);
      queryClient.setQueriesData<{ data: Monitor[]; meta?: MonitorListMeta }>(
        { queryKey: monitorKeys.lists() },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((m) => (m.id === variables.id ? updated : m)),
          };
        }
      );
      void queryClient.invalidateQueries({ queryKey: monitorKeys.lists() });
    },
  });
}

/**
 * Phase 1.2 — bulk operations.
 *
 * Returns the structured `{ succeeded, failed, requested }` envelope so the
 * caller (action bar) can show partial-success toasts. We invalidate the list
 * AND every detail page on success because the action may have flipped
 * `isEnabled` / `status` for many monitors at once.
 */
export function useBulkActOnMonitors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      monitorIds,
    }: {
      action: MonitorBulkAction;
      monitorIds: string[];
    }) => monitorsApi.bulkActOnMonitors(action, monitorIds),
    onSuccess: (_response, variables) => {
      void queryClient.invalidateQueries({ queryKey: monitorKeys.lists() });
      for (const id of variables.monitorIds) {
        void queryClient.invalidateQueries({ queryKey: monitorKeys.detail(id) });
      }
    },
  });
}

export function useTriggerCheck(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => monitorsApi.triggerCheck(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitorKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: monitorKeys.checks(id) });
    },
  });
}

/**
 * V-2: trigger a synchronous visual capture for a monitor. Cooldown / 429
 * handling lives on the caller — the mutation simply surfaces the server
 * message so the UI can render a toast.
 */
export function useTriggerVisualCaptureNow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => monitorsApi.triggerMonitorVisualCaptureNow(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: monitorKeys.visualCaptures(id) });
      void queryClient.invalidateQueries({ queryKey: monitorKeys.visualChanges(id) });
    },
  });
}
