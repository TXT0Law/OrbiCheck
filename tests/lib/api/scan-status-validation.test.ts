import { describe, expect, it } from "vitest";

import { ScanDetailResponseSchema } from "@/shared/schemas/scan";

const scan = {
  id: "scan-1", domain: "example.com", url: "https://example.com",
  status: "completed", scannedAt: null, duration: null, securityScore: null,
  severity: { critical: 0, high: 0, medium: 0, low: 0 },
  categorySummary: [], keyFindings: [], moduleErrors: {},
};
const status = {
  httpStatusCode: null, responseTimeMs: null, serverHeader: "",
  contentType: "", redirectCount: 0,
};

describe("scan detail status boundary", () => {
  it.each([
    { httpStatusCode: 0 }, { httpStatusCode: 600 },
    { responseTimeMs: -1 }, { redirectCount: -1 },
    { httpStatusCode: 403, fetchOutcome: "timeout" },
  ])("rejects invalid status observation %j", (invalid) => {
    expect(ScanDetailResponseSchema.safeParse({ ...scan,
      statusCheck: { ...status, ...invalid },
    }).success).toBe(false);
  });
  it("rejects malformed HTTP status values", () => {
    expect(ScanDetailResponseSchema.safeParse({ ...scan,
      statusCheck: { ...status, httpStatusCode: "403" },
    }).success).toBe(false);
  });
  it("rejects unrecognized fetch outcomes", () => {
    expect(ScanDetailResponseSchema.safeParse({ ...scan,
      statusCheck: { ...status, fetchOutcome: "future_reason" },
    }).success).toBe(false);
  });
  it.each(["dns_error", "tls_error", "timeout", "circuit_open", "network_error"])(
    "retains %s with nullable measurements", (fetchOutcome) => {
      expect(ScanDetailResponseSchema.parse({ ...scan,
        statusCheck: { ...status, fetchOutcome },
      }).statusCheck).toEqual({ ...status, fetchOutcome });
    },
  );
  it.each([403, 429, 503])("retains actual HTTP %i", (httpStatusCode) => {
    const observation = { ...status, httpStatusCode, responseTimeMs: 12, fetchOutcome: "http_response" };
    expect(ScanDetailResponseSchema.parse({ ...scan, statusCheck: observation }).statusCheck).toEqual(observation);
  });
  it("accepts historical missing outcomes and unavailable modules", () => {
    expect(ScanDetailResponseSchema.safeParse({ ...scan, statusCheck: status }).success).toBe(true);
    expect(ScanDetailResponseSchema.safeParse({ ...scan, statusCheck: null }).success).toBe(true);
    expect(ScanDetailResponseSchema.safeParse(scan).success).toBe(true);
  });
});
