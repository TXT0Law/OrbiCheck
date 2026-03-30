import { describe, expect, it } from "vitest";

import { SCAN_MODULES, type ScanModuleId } from "@/lib/constants/scan-modules";
import {
  getModuleDetailHref,
  getPageLabelFromPathname,
  resolveModuleHrefParts,
  SCAN_MODULE_ROUTE_MAP,
} from "@/lib/constants/scan-module-routes";

describe("scan-module-routes", () => {
  it("maps every SCAN_MODULES id in SCAN_MODULE_ROUTE_MAP", () => {
    for (const id of SCAN_MODULES) {
      expect(SCAN_MODULE_ROUTE_MAP[id as ScanModuleId]).toBeDefined();
    }
  });

  it("getPageLabelFromPathname uses segment index 3 (after dashboard/scan/[id])", () => {
    expect(getPageLabelFromPathname("/dashboard/scan/abc-123/ssl")).toBe("SSL Certificate");
    expect(getPageLabelFromPathname("/dashboard/scan/abc-123")).toBe("Dashboard Summary");
    expect(getPageLabelFromPathname("/dashboard/scan/abc-123/dns")).toBe("DNS Records");
  });

  it("resolveModuleHrefParts deep-links merged modules", () => {
    expect(resolveModuleHrefParts("page-source")).toEqual({ segment: "screenshot", hash: "#page-source" });
    expect(resolveModuleHrefParts("block-lists")).toEqual({ segment: "threats", hash: "#block-lists" });
    expect(resolveModuleHrefParts("carbon")).toEqual({ segment: "ranking", hash: "" });
    expect(resolveModuleHrefParts("legacy-rank")).toEqual({ segment: "ranking", hash: "#legacy-rank" });
  });

  it("getModuleDetailHref builds dashboard URLs", () => {
    expect(getModuleDetailHref("s1", "dns")).toBe("/dashboard/scan/s1/dns");
    expect(getModuleDetailHref("s1", "txt-records")).toBe("/dashboard/scan/s1/dns#txt-records");
  });
});
