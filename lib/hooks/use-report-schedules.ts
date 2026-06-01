import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as reportSchedulesApi from "@/lib/api/report-schedules";
import type {
  ReportScheduleCreateParams,
  ReportScheduleUpdateParams,
} from "@/shared/types/report";

const SCHEDULE_POLL_MS = 5000;

export const reportScheduleKeys = {
  all: ["report-schedules"] as const,
  list: () => [...reportScheduleKeys.all, "list"] as const,
  runs: (scheduleId: string) => [...reportScheduleKeys.all, scheduleId, "runs"] as const,
};

function hasActiveRun(status: string): boolean {
  return status === "pending" || status === "generating" || status === "delivering";
}

function invalidateReportScheduleQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: reportScheduleKeys.all });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
}

export function useReportSchedules() {
  return useQuery({
    queryKey: reportScheduleKeys.list(),
    queryFn: reportSchedulesApi.listReportSchedules,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const schedules = query.state.data?.schedules ?? [];
      return schedules.some((schedule) =>
        schedule.recentRuns.some((run) => hasActiveRun(run.status)),
      )
        ? SCHEDULE_POLL_MS
        : false;
    },
  });
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReportScheduleCreateParams) =>
      reportSchedulesApi.createReportSchedule(payload),
    onSuccess: () => invalidateReportScheduleQueries(queryClient),
  });
}

export function useUpdateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: ReportScheduleUpdateParams;
    }) => reportSchedulesApi.updateReportSchedule(id, payload),
    onSuccess: () => invalidateReportScheduleQueries(queryClient),
  });
}

export function useDeleteReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reportSchedulesApi.deleteReportSchedule,
    onSuccess: () => invalidateReportScheduleQueries(queryClient),
  });
}

export function useRunReportScheduleNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reportSchedulesApi.runReportScheduleNow,
    onSuccess: () => invalidateReportScheduleQueries(queryClient),
  });
}
