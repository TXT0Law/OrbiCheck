import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAllScans,
  deleteScan,
  listScans,
  rescanScan,
  type ScanListSortBy,
  type ScanStatusGroup,
} from "@/lib/api/scans";
import type { ScanResponse } from "@/shared/types/api";

interface UseScanListOptions {
  refetchInterval?: number | false;
  /** Auto-refresh every 3s while any scan is running/pending */
  refetchWhenActive?: boolean;
  /** Override the polling interval when `refetchWhenActive` is enabled. */
  refetchWhenActiveMs?: number;
}

interface UseScanListParams {
  page?: number;
  size?: number;
  search?: string;
  sortBy?: ScanListSortBy;
  statusGroup?: ScanStatusGroup;
}

export function useScanList(params?: UseScanListParams, options?: UseScanListOptions) {
  const page = params?.page ?? 1;
  const size = params?.size ?? 20;
  const search = params?.search?.trim() || undefined;
  const sortBy = params?.sortBy ?? "created_at_desc";
  const statusGroup = params?.statusGroup ?? "all";

  const refetchInterval =
    options?.refetchInterval !== undefined
      ? options.refetchInterval
      : options?.refetchWhenActive
        ? (query: { state: { data?: { scans?: { status: string }[] } } }) => {
            const scans = query?.state?.data?.scans ?? [];
            const hasActive = scans.some(
              (s) => s.status === "running" || s.status === "pending"
            );
            return hasActive ? options?.refetchWhenActiveMs ?? 3000 : false;
          }
        : false;

  return useQuery({
    queryKey: ["scans", page, size, search ?? "", sortBy, statusGroup],
    queryFn: () => listScans(page, size, { search, sortBy, statusGroup }),
    staleTime: 30_000,
    refetchInterval,
  });
}

export function useDeleteScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scanId: string) => deleteScan(scanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
  });
}

export function useRescan(onSuccess?: (scan: ScanResponse) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scanId }: { scanId: string }) => rescanScan(scanId),
    onSuccess: (scan) => {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["scan", scan.id] });
      onSuccess?.(scan);
    },
  });
}

export function useDeleteAllScans() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params?: { search?: string; statusGroup?: ScanStatusGroup }) =>
      deleteAllScans(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
  });
}
