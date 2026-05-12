/**
 * Unified API response wrapper types.
 * Matches backend FastAPI response format.
 */

export interface ApiSuccessResponse<T> {
  status: "success";
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  status: "error";
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// === Scan API specific ===

export interface ScanResponse {
  id: string;
  url: string;
  domain: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  totalModules: number;
  completedModules: number;
  securityScore: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ScanModuleResultResponse {
  id: string;
  moduleName: string;
  status: "pending" | "running" | "success" | "failed" | "timeout";
  rawResult: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  completedAt: string | null;
}

export interface ScanDetailApiResponse extends ScanResponse {
  moduleResults: ScanModuleResultResponse[];
}

export interface ScanListApiResponse {
  scans: ScanResponse[];
  total: number;
}

export interface ScanProgressEvent {
  progress: number;
  phase: "pending" | "quick" | "medium" | "heavy" | "done" | "error" | "cancelled";
  detail: string;
  completedModules: number;
  totalModules: number;
  /**
   * S-11: module names currently in flight in the active batch (or
   * being retried per S-10). Empty between batches and on terminal
   * events. Optional so legacy SSE payloads keep parsing.
   */
  currentModules?: string[];
  /**
   * S-11: true when the orchestrator has observed enough HTTP failures
   * against the target during this scan that further requests are
   * likely to be rate-limited / 5xx. Lets the UI hint "target may be
   * slow" instead of letting the user assume OrbiCheck is broken.
   */
  degradedTarget?: boolean;
  done?: boolean;
  error?: boolean;
  cancelled?: boolean;
}

// === URL Group API contracts ===

export interface UrlGroupContract {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UrlGroupMemberContract {
  id: string;
  url: string;
  displayLabel: string | null;
  sortOrder: number;
  createdAt: string;
  scanId: string | null;
  status: string;
  securityScore: number | null;
}
