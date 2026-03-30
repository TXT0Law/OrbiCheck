import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  isDiffRequestTimeoutError,
  isSnapshotPurgedDiffError,
  shouldClearChangeQueryFromDiffError,
} from "@/lib/utils/monitor-diff-errors";

describe("shouldClearChangeQueryFromDiffError", () => {
  it("returns true for CHANGE_NOT_FOUND (covers wrong-monitor message from backend)", () => {
    expect(
      shouldClearChangeQueryFromDiffError(
        new ApiError("Change does not belong to this monitor", {
          status: 404,
          code: "CHANGE_NOT_FOUND",
        })
      )
    ).toBe(true);
  });

  it("returns true for MONITOR_NOT_FOUND", () => {
    expect(
      shouldClearChangeQueryFromDiffError(
        new ApiError("Monitor not found", { status: 404, code: "MONITOR_NOT_FOUND" })
      )
    ).toBe(true);
  });

  it("returns false for SNAPSHOT_NOT_FOUND (retention / purged)", () => {
    expect(
      shouldClearChangeQueryFromDiffError(
        new ApiError("Snapshot purged", { status: 404, code: "SNAPSHOT_NOT_FOUND" })
      )
    ).toBe(false);
  });

  it("returns false for 403", () => {
    expect(
      shouldClearChangeQueryFromDiffError(
        new ApiError("Forbidden", { status: 403, code: "FORBIDDEN" })
      )
    ).toBe(false);
  });

  it("returns false for plain Error with English not found substring (no status)", () => {
    expect(shouldClearChangeQueryFromDiffError(new Error("not found"))).toBe(false);
  });
});

describe("isSnapshotPurgedDiffError", () => {
  it("uses SNAPSHOT_NOT_FOUND code", () => {
    expect(
      isSnapshotPurgedDiffError(
        new ApiError("x", { status: 404, code: "SNAPSHOT_NOT_FOUND" })
      )
    ).toBe(true);
  });
});

describe("isDiffRequestTimeoutError", () => {
  it("detects timeout in message", () => {
    expect(isDiffRequestTimeoutError(new Error("timeout of 5000ms exceeded"))).toBe(true);
  });
});
