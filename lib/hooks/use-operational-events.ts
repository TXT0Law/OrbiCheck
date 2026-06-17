import { useQuery } from "@tanstack/react-query";

import {
  getMonitorOperationalEvents,
  getReportOperationalEvents,
  getScanOperationalEvents,
  getUrlGroupRunOperationalEvents,
} from "@/lib/api/operational-events";

const OPERATIONAL_EVENTS_STALE_MS = 30_000;

export const operationalEventKeys = {
  report: (reportId: string, limit: number) =>
    ["operational-events", "report", reportId, limit] as const,
  monitor: (monitorId: string, limit: number) =>
    ["operational-events", "monitor", monitorId, limit] as const,
  scan: (scanId: string, limit: number) =>
    ["operational-events", "scan", scanId, limit] as const,
  groupRun: (groupId: string, runId: string, limit: number) =>
    ["operational-events", "url-group-run", groupId, runId, limit] as const,
};

export function useReportOperationalEvents(reportId: string, limit = 10) {
  return useQuery({
    queryKey: operationalEventKeys.report(reportId, limit),
    queryFn: () => getReportOperationalEvents(reportId, limit),
    enabled: Boolean(reportId),
    staleTime: OPERATIONAL_EVENTS_STALE_MS,
  });
}

export function useMonitorOperationalEvents(monitorId: string, limit = 10) {
  return useQuery({
    queryKey: operationalEventKeys.monitor(monitorId, limit),
    queryFn: () => getMonitorOperationalEvents(monitorId, limit),
    enabled: Boolean(monitorId),
    staleTime: OPERATIONAL_EVENTS_STALE_MS,
  });
}

export function useScanOperationalEvents(scanId: string, limit = 10) {
  return useQuery({
    queryKey: operationalEventKeys.scan(scanId, limit),
    queryFn: () => getScanOperationalEvents(scanId, limit),
    enabled: Boolean(scanId),
    staleTime: OPERATIONAL_EVENTS_STALE_MS,
  });
}

export function useUrlGroupRunOperationalEvents(
  groupId: string,
  runId: string,
  limit = 10
) {
  return useQuery({
    queryKey: operationalEventKeys.groupRun(groupId, runId, limit),
    queryFn: () => getUrlGroupRunOperationalEvents(groupId, runId, limit),
    enabled: Boolean(groupId) && Boolean(runId),
    staleTime: OPERATIONAL_EVENTS_STALE_MS,
  });
}
