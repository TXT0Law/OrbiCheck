import { describe, expect, it } from "vitest";

import {
  SCAN_MODULES,
  MODULE_BATCHES,
  SCAN_MODULE_LABELS,
  type ScanModuleId,
} from "@/lib/constants/scan-modules";

describe("SCAN_MODULES", () => {
  it("is a non-empty array of module ids", () => {
    expect(Array.isArray(SCAN_MODULES)).toBe(true);
    expect(SCAN_MODULES.length).toBeGreaterThan(0);
    expect(SCAN_MODULES.every((m) => typeof m === "string")).toBe(true);
  });

  it("contains expected core modules", () => {
    expect(SCAN_MODULES).toContain("status");
    expect(SCAN_MODULES).toContain("ssl");
    expect(SCAN_MODULES).toContain("screenshot");
    expect(SCAN_MODULES).toContain("page-source");
  });
});

describe("MODULE_BATCHES", () => {
  it("has quick, medium, heavy batches", () => {
    expect(MODULE_BATCHES).toHaveProperty("quick");
    expect(MODULE_BATCHES).toHaveProperty("medium");
    expect(MODULE_BATCHES).toHaveProperty("heavy");
  });

  it("each batch is non-empty", () => {
    expect(MODULE_BATCHES.quick.length).toBeGreaterThan(0);
    expect(MODULE_BATCHES.medium.length).toBeGreaterThan(0);
    expect(MODULE_BATCHES.heavy.length).toBeGreaterThan(0);
  });

  it("all batch modules exist in SCAN_MODULES", () => {
    const allBatchModules = [
      ...MODULE_BATCHES.quick,
      ...MODULE_BATCHES.medium,
      ...MODULE_BATCHES.heavy,
    ];
    for (const m of allBatchModules) {
      expect(SCAN_MODULES).toContain(m);
    }
  });
});

describe("SCAN_MODULE_LABELS", () => {
  it("has a label for every module in SCAN_MODULES", () => {
    for (const mod of SCAN_MODULES) {
      expect(SCAN_MODULE_LABELS[mod]).toBeDefined();
      expect(typeof SCAN_MODULE_LABELS[mod]).toBe("string");
      expect(SCAN_MODULE_LABELS[mod].length).toBeGreaterThan(0);
    }
  });

  it("has human-readable labels for common modules", () => {
    expect(SCAN_MODULE_LABELS.ssl).toBe("SSL");
    expect(SCAN_MODULE_LABELS.screenshot).toBe("Screenshot");
  });
});

describe("ScanModuleId type", () => {
  it("accepts valid module ids from SCAN_MODULES", () => {
    const firstModule: ScanModuleId = SCAN_MODULES[0];
    expect(firstModule).toBeDefined();
    expect(SCAN_MODULES).toContain(firstModule);
  });
});
