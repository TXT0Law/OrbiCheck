import { ApiError } from "@/lib/api/client";

/** True when the selected change id should be removed from the URL (invalid / wrong monitor). */
export function shouldClearChangeQueryFromDiffError(err: unknown): boolean {
  if (!ApiError.isApiError(err)) {
    return false;
  }
  if (err.status === 403) {
    return false;
  }
  if (err.status === 404) {
    if (err.code === "SNAPSHOT_NOT_FOUND") {
      return false;
    }
    if (err.code === "CHANGE_NOT_FOUND" || err.code === "MONITOR_NOT_FOUND") {
      return true;
    }
    return err.code == null;
  }
  return false;
}

/** Snapshot bodies purged for diff preview; change row may still exist. */
export function isSnapshotPurgedDiffError(err: unknown): boolean {
  if (ApiError.isApiError(err) && err.code === "SNAPSHOT_NOT_FOUND") {
    return true;
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes("purged") || m.includes("retention");
  }
  return false;
}

export function isDiffRequestTimeoutError(err: unknown): boolean {
  if (ApiError.isApiError(err)) {
    const m = err.message.toLowerCase();
    if (m.includes("timeout")) return true;
    const cause = err.cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      return (cause as { code?: string }).code === "ECONNABORTED";
    }
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes("timeout") || m.includes("econnaborted");
  }
  return false;
}
