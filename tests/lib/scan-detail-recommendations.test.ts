import { describe, expect, it } from "vitest";

import type { Recommendation, ScanDetail } from "@/shared/types/scan";

/**
 * Type-shape guard for the new ``ScanDetail.recommendations`` field
 * introduced by middleReport.md T0.3. The detail endpoint and the offline
 * report payload both consume the same backend service, so the wire-level
 * shape MUST be ``{ severity, title, description }`` per item.
 *
 * These assertions intentionally exercise the structural type contract;
 * any breakage here signals a divergence between web and report renderers.
 */
describe("ScanDetail.recommendations contract", () => {
  it("accepts an array of Recommendation items shaped { severity, title, description }", () => {
    const sample: Recommendation[] = [
      {
        severity: "critical",
        title: "Replace expired SSL certificate",
        description: "Renew the public certificate immediately.",
      },
      {
        severity: "high",
        title: "Renew SSL certificate soon",
        description: "Schedule rotation before the validity window closes.",
      },
      {
        severity: "medium",
        title: "Enable DNSSEC validation",
        description: "Sign the zone and publish DS records.",
      },
    ];

    expect(sample).toHaveLength(3);
    expect(sample.every((item) => typeof item.title === "string")).toBe(true);
    expect(sample.every((item) => typeof item.description === "string")).toBe(true);
    expect(sample.map((item) => item.severity)).toEqual(["critical", "high", "medium"]);
  });

  it("treats recommendations as optional on ScanDetail (running scans may omit it)", () => {
    const minimalDetail: Pick<ScanDetail, "id" | "recommendations"> = {
      id: "scan-1",
    };

    expect(minimalDetail.recommendations).toBeUndefined();
  });

  it("supports an empty recommendations array (no actions yet)", () => {
    const empty: Pick<ScanDetail, "recommendations"> = { recommendations: [] };

    expect(Array.isArray(empty.recommendations)).toBe(true);
    expect(empty.recommendations).toHaveLength(0);
  });
});
