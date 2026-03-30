import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createReport,
  deleteReport,
  getReport,
  getReportPreview,
  listReports,
} from "@/lib/api/reports";
import type { ReportStatus } from "@/shared/types/report";

const REPORT_POLL_MS = 3000;

function shouldPoll(status: string | undefined): boolean {
  return status === "pending" || status === "generating";
}

export function useReportList(params?: {
  page?: number;
  limit?: number;
  status?: ReportStatus;
}) {
  return useQuery({
    queryKey: ["reports", params ?? {}],
    queryFn: () => listReports(params),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const rows = query.state.data?.reports ?? [];
      return rows.some((row) => shouldPoll(row.status)) ? REPORT_POLL_MS : false;
    },
  });
}

export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ["report", reportId ?? ""],
    queryFn: () => {
      if (!reportId) {
        throw new Error("reportId is required");
      }
      return getReport(reportId);
    },
    enabled: Boolean(reportId),
    refetchInterval: (query) => (shouldPoll(query.state.data?.status) ? REPORT_POLL_MS : false),
  });
}

export function useReportPreview(reportId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["report-preview", reportId ?? ""],
    queryFn: () => {
      if (!reportId) {
        throw new Error("reportId is required");
      }
      return getReportPreview(reportId);
    },
    enabled: Boolean(reportId) && enabled,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createReport,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteReport,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
