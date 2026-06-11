import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  DISABLE_GLOBAL_ERROR_TOAST_META,
  GLOBAL_ERROR_TOAST_DEDUPE_MS,
  getGlobalErrorToast,
  getGlobalErrorToastSignature,
  shouldEmitGlobalErrorToast,
  shouldShowQueryErrorToast,
  shouldSuppressGlobalErrorToast,
} from "@/lib/query-error-handling";

describe("query error handling", () => {
  it("formats ApiError messages with code and status details", () => {
    const toast = getGlobalErrorToast(
      new ApiError("Monitor not found", {
        status: 404,
        code: "MONITOR_NOT_FOUND",
      }),
    );

    expect(toast).toEqual({
      title: "Request failed",
      description: "Monitor not found (MONITOR_NOT_FOUND · HTTP 404)",
    });
  });

  it("uses a clear title for invalid response shapes", () => {
    const toast = getGlobalErrorToast(
      new ApiError("Invalid monitor list response from server", {
        status: 502,
        code: "INVALID_RESPONSE_SHAPE",
      }),
    );

    expect(toast.title).toBe("Invalid server response");
    expect(toast.description).toContain("INVALID_RESPONSE_SHAPE");
  });

  it("formats network and unknown errors consistently", () => {
    expect(getGlobalErrorToast(new Error("Network Error"))).toEqual({
      title: "Request failed",
      description: "Network Error",
    });
    expect(getGlobalErrorToast(null)).toEqual({
      title: "Request failed",
      description: "Something went wrong. Please try again.",
    });
  });

  it("suppresses configured toasts and background query refetch noise", () => {
    expect(
      shouldSuppressGlobalErrorToast({
        [DISABLE_GLOBAL_ERROR_TOAST_META]: true,
      }),
    ).toBe(true);
    expect(shouldSuppressGlobalErrorToast(undefined)).toBe(false);
    expect(shouldShowQueryErrorToast(false)).toBe(true);
    expect(shouldShowQueryErrorToast(true)).toBe(false);
  });

  it("deduplicates identical global error toasts within the cooldown window", () => {
    const toast = getGlobalErrorToast(new Error("Repeated failure"));
    const signature = getGlobalErrorToastSignature(toast);

    expect(shouldEmitGlobalErrorToast(signature, undefined, 1_000)).toBe(true);
    expect(shouldEmitGlobalErrorToast(signature, 1_000, 1_000 + 500)).toBe(false);
    expect(
      shouldEmitGlobalErrorToast(
        signature,
        1_000,
        1_000 + GLOBAL_ERROR_TOAST_DEDUPE_MS,
      ),
    ).toBe(true);
  });
});
