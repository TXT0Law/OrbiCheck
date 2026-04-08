import type { ScanListApiResponse, ScanResponse } from "@/shared/types/api";
import type { ModuleRetryResponse, ScanDetail } from "@/shared/types/scan";

import { apiClient } from "./client";

type ScanWire = ScanResponse & {
  total_modules?: number;
  completed_modules?: number;
  security_score?: number | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
};

export interface CreateScanOptions {
  modules?: string[];
  enablePortScan?: boolean;
  portScanProfile?: "quick" | "standard" | "deep";
  acknowledgeScanAuthorization?: boolean;
}

export type ScanListSortBy =
  | "created_at_desc"
  | "created_at_asc"
  | "security_score_desc"
  | "security_score_asc"
  | "domain_asc"
  | "domain_desc"
  | "progress_desc";

export type ScanStatusGroup =
  | "all"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "active"
  | "terminal";

function normalizeScan(scan: ScanWire): ScanResponse {
  return {
    ...scan,
    totalModules: scan.totalModules ?? scan.total_modules ?? 0,
    completedModules: scan.completedModules ?? scan.completed_modules ?? 0,
    securityScore:
      scan.securityScore ?? scan.security_score ?? null,
    errorMessage: scan.errorMessage ?? scan.error_message ?? null,
    startedAt: scan.startedAt ?? scan.started_at ?? null,
    completedAt: scan.completedAt ?? scan.completed_at ?? null,
    createdAt: scan.createdAt ?? scan.created_at ?? new Date().toISOString(),
  };
}

export async function createScan(
  url: string,
  options?: CreateScanOptions
): Promise<ScanResponse> {
  const body: {
    url: string;
    modules?: string[];
    enablePortScan?: boolean;
    portScanProfile?: "quick" | "standard" | "deep";
    acknowledgeScanAuthorization?: boolean;
  } = { url };
  if (options?.modules && options.modules.length > 0) {
    body.modules = options.modules;
  }
  if (typeof options?.enablePortScan === "boolean") {
    body.enablePortScan = options.enablePortScan;
  }
  if (options?.portScanProfile) {
    body.portScanProfile = options.portScanProfile;
  }
  if (typeof options?.acknowledgeScanAuthorization === "boolean") {
    body.acknowledgeScanAuthorization = options.acknowledgeScanAuthorization;
  }
  const { data } = await apiClient.post<ScanWire>("/scans", body);
  return normalizeScan(data);
}

export async function listScans(
  page = 1,
  size = 20,
  filters?: {
    search?: string;
    sortBy?: ScanListSortBy;
    statusGroup?: ScanStatusGroup;
  }
): Promise<ScanListApiResponse> {
  const limit = size;
  const offset = Math.max(0, (page - 1) * size);
  const search = filters?.search?.trim();

  const { data } = await apiClient.get<{ scans: ScanWire[]; total: number }>("/scans", {
    params: {
      limit,
      offset,
      ...(search ? { search } : {}),
      ...(filters?.sortBy ? { sort_by: filters.sortBy } : {}),
      ...(filters?.statusGroup ? { status_group: filters.statusGroup } : {}),
    },
  });
  return {
    total: data.total,
    scans: data.scans.map(normalizeScan),
  };
}

export async function getScan(scanId: string): Promise<ScanResponse> {
  const { data } = await apiClient.get<ScanWire>(`/scans/${scanId}`);
  return normalizeScan(data);
}

export async function getScanDetail(scanId: string): Promise<ScanDetail> {
  const { data } = await apiClient.get<ScanDetail>(`/scans/${scanId}/detail`);
  return data;
}

export async function cancelScan(scanId: string): Promise<void> {
  await apiClient.post(`/scans/${scanId}/cancel`);
}

export async function rescanScan(scanId: string): Promise<ScanResponse> {
  const { data } = await apiClient.post<ScanWire>(`/scans/${scanId}/rescan`);
  return normalizeScan(data);
}

export async function deleteScan(scanId: string): Promise<void> {
  await apiClient.delete(`/scans/${scanId}`);
}

export async function retryModule(scanId: string, moduleName: string): Promise<ModuleRetryResponse> {
  const { data } = await apiClient.post<ModuleRetryResponse>(
    `/scans/${scanId}/modules/${moduleName}/retry`
  );
  return data;
}

export async function deleteAllScans(filters?: {
  search?: string;
  statusGroup?: ScanStatusGroup;
}): Promise<number> {
  const search = filters?.search?.trim();
  const statusGroup = filters?.statusGroup;

  try {
    const { data } = await apiClient.delete<{ deleted: number }>("/scans", {
      params: {
        ...(search ? { search } : {}),
        ...(statusGroup ? { status_group: statusGroup } : {}),
      },
    });

    return data.deleted;
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "response" in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;

    // Backward-compatible fallback for deployments that do not yet expose DELETE /scans.
    if (status !== 405) {
      throw error;
    }

    let page = 1;
    const size = 100;
    let deleted = 0;

    while (true) {
      const result = await listScans(page, size, {
        search,
        sortBy: "created_at_desc",
        statusGroup,
      });

      if (result.scans.length === 0) {
        break;
      }

      await Promise.all(result.scans.map((scan) => deleteScan(scan.id)));
      deleted += result.scans.length;

      if (result.scans.length < size) {
        break;
      }

      page += 1;
    }

    return deleted;
  }
}
