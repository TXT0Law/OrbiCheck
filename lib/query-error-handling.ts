import { ApiError } from "@/lib/api/client";

interface GlobalErrorToast {
  title: string;
  description: string;
}

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";
export const GLOBAL_ERROR_TOAST_DEDUPE_MS = 10_000;

export const DISABLE_GLOBAL_ERROR_TOAST_META = "disableGlobalErrorToast";

export function shouldShowQueryErrorToast(hasCachedData: boolean): boolean {
  return !hasCachedData;
}

export function shouldSuppressGlobalErrorToast(meta: unknown): boolean {
  return (
    typeof meta === "object" &&
    meta !== null &&
    DISABLE_GLOBAL_ERROR_TOAST_META in meta &&
    Boolean(
      (meta as Record<typeof DISABLE_GLOBAL_ERROR_TOAST_META, unknown>)[
        DISABLE_GLOBAL_ERROR_TOAST_META
      ],
    )
  );
}

export function getGlobalErrorToast(error: unknown): GlobalErrorToast {
  if (ApiError.isApiError(error)) {
    const detailParts = [error.code, error.status ? `HTTP ${error.status}` : undefined]
      .filter(Boolean)
      .join(" · ");
    return {
      title: error.code === "INVALID_RESPONSE_SHAPE" ? "Invalid server response" : "Request failed",
      description: detailParts ? `${error.message} (${detailParts})` : error.message,
    };
  }

  if (error instanceof Error) {
    return {
      title: "Request failed",
      description: error.message || DEFAULT_ERROR_MESSAGE,
    };
  }

  return {
    title: "Request failed",
    description: DEFAULT_ERROR_MESSAGE,
  };
}

export function getGlobalErrorToastSignature(toast: GlobalErrorToast): string {
  return `${toast.title}\n${toast.description}`;
}

export function shouldEmitGlobalErrorToast(
  signature: string,
  lastEmittedAtMs: number | undefined,
  nowMs: number,
): boolean {
  return (
    lastEmittedAtMs === undefined ||
    nowMs - lastEmittedAtMs >= GLOBAL_ERROR_TOAST_DEDUPE_MS
  );
}
