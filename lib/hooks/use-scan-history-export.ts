"use client";

import { useMutation } from "@tanstack/react-query";

import { downloadFromApiGet } from "@/lib/api/download";
import type { ScanListSortBy, ScanStatusGroup } from "@/lib/api/scans";

// Mirrors the backend's per-request CSV cap. Later pages remain available via offset.
export const SCAN_HISTORY_EXPORT_LIMIT = 5_000;

export interface ScanHistoryExportFilters {
  search?: string;
  sortBy: ScanListSortBy;
  statusGroup: ScanStatusGroup;
}

export function useScanHistoryExport() {
  return useMutation({
    mutationFn: (filters: ScanHistoryExportFilters) => {
      const params = new URLSearchParams({
        limit: String(SCAN_HISTORY_EXPORT_LIMIT),
        offset: "0",
        sort_by: filters.sortBy,
        status_group: filters.statusGroup,
      });
      if (filters.search?.trim()) {
        params.set("search", filters.search.trim());
      }
      return downloadFromApiGet(
        `/scans/export.csv?${params.toString()}`,
        "scan-history.csv",
      );
    },
  });
}
