import { describe, expect, it } from "vitest";

import { shouldSubscribeDetailProgressSse } from "@/lib/utils/scan-detail-progress-sse";

describe("shouldSubscribeDetailProgressSse", () => {
  it("returns false when scan is not in progress", () => {
    expect(shouldSubscribeDetailProgressSse("completed", "s1", null)).toBe(false);
    expect(shouldSubscribeDetailProgressSse("failed", "s1", "s1")).toBe(false);
  });

  it("subscribes when running and there is no active scan", () => {
    expect(shouldSubscribeDetailProgressSse("running", "s1", null)).toBe(true);
    expect(shouldSubscribeDetailProgressSse("running", "s1", undefined)).toBe(true);
  });

  it("subscribes when active scan is a different id", () => {
    expect(shouldSubscribeDetailProgressSse("running", "s1", "s2")).toBe(true);
  });

  it("does not subscribe when active scan matches route (parent layout owns SSE)", () => {
    expect(shouldSubscribeDetailProgressSse("running", "s1", "s1")).toBe(false);
    expect(shouldSubscribeDetailProgressSse("pending", "s1", "s1")).toBe(false);
  });
});
