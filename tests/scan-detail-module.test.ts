import { describe, expect, it } from "vitest";

import { isScanModuleAwaitingData } from "@/lib/scan-detail-module";

describe("isScanModuleAwaitingData", () => {
  it("is true when scan is active and module slice is nullish", () => {
    expect(isScanModuleAwaitingData("running", null)).toBe(true);
    expect(isScanModuleAwaitingData("pending", undefined)).toBe(true);
  });

  it("is false when scan finished or slice exists", () => {
    expect(isScanModuleAwaitingData("completed", null)).toBe(false);
    expect(isScanModuleAwaitingData("running", {})).toBe(false);
    expect(isScanModuleAwaitingData("running", [])).toBe(false);
    expect(isScanModuleAwaitingData(undefined, null)).toBe(false);
  });
});
