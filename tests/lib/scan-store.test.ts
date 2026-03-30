import { describe, expect, it } from "vitest";

import { useScanStore } from "@/lib/stores/scan-store";

describe("scan store", () => {
  it("sets and clears active scan", () => {
    useScanStore.getState().setActiveScan(null);

    useScanStore.getState().setActiveScan({
      scanId: "scan-1",
      url: "https://example.com",
      domain: "example.com",
    });

    expect(useScanStore.getState().activeScan).toEqual({
      scanId: "scan-1",
      url: "https://example.com",
      domain: "example.com",
    });

    useScanStore.getState().clearActiveScan();
    expect(useScanStore.getState().activeScan).toBeNull();
    expect(useScanStore.getState().activeScanProgress).toBeNull();
    expect(useScanStore.getState().activeScanProgressError).toBeNull();
  });
});
