import { describe, expect, it } from "vitest";

import { scanDetailRefetchInterval } from "@/lib/hooks/use-scan-detail";

describe("scanDetailRefetchInterval", () => {
  it("polls while pending or running", () => {
    expect(scanDetailRefetchInterval("pending")).toBe(3000);
    expect(scanDetailRefetchInterval("running")).toBe(3000);
  });

  it("does not poll when finished", () => {
    expect(scanDetailRefetchInterval("completed")).toBe(false);
    expect(scanDetailRefetchInterval("failed")).toBe(false);
    expect(scanDetailRefetchInterval("cancelled")).toBe(false);
    expect(scanDetailRefetchInterval(undefined)).toBe(false);
  });
});
