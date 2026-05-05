import { describe, expect, it, vi } from "vitest";

import {
  downloadJson,
  pickScanDetailExportSummary,
  pickScanFullExport,
  type ScanFullExport,
} from "@/lib/utils/export-json";
import type { ScanDetail } from "@/shared/types/scan";

const detail = {
  id: "scan-1",
  domain: "example.com",
  url: "https://example.com",
  scannedAt: "2026-05-04T00:00:00Z",
  duration: "12.0s",
  status: "completed",
  securityScore: 80,
  severity: { critical: 0, high: 1, medium: 0, low: 0 },
  categorySummary: [],
  keyFindings: [],
  moduleJobs: [{ module: "ssl", status: "success", durationMs: 1000 }],
  moduleErrors: {},
  totalDurationMs: 1000,
} as unknown as ScanDetail;

const fullExport: ScanFullExport = {
  summary: detail,
  rawResults: {
    ssl: {
      status: "success",
      durationMs: 1000,
      errorMessage: null,
      rawResult: { issuer: "Let's Encrypt" },
    },
  },
  exportedAt: "2026-05-04T01:00:00Z",
};

describe("pickScanDetailExportSummary", () => {
  it("returns only the summary subset of fields", () => {
    const picked = pickScanDetailExportSummary(detail);
    expect(picked).toMatchObject({
      id: "scan-1",
      domain: "example.com",
      securityScore: 80,
      severity: detail.severity,
      moduleJobs: detail.moduleJobs,
    });
    expect("ssl" in picked).toBe(false);
  });
});

describe("pickScanFullExport", () => {
  it("composes summary + detail + rawResults + exportedAt", () => {
    const composed = pickScanFullExport(detail, fullExport);
    expect(composed.summary).toEqual(pickScanDetailExportSummary(detail));
    expect(composed.detail).toBe(fullExport.summary);
    expect(composed.rawResults.ssl.rawResult).toMatchObject({ issuer: "Let's Encrypt" });
    expect(composed.exportedAt).toBe("2026-05-04T01:00:00Z");
  });
});

describe("downloadJson", () => {
  it("writes a JSON blob to an anchor and revokes the object URL", () => {
    const click = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:json"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      set href(_value: string) {},
      set download(_value: string) {},
      set rel(_value: string) {},
    } as unknown as HTMLAnchorElement);

    downloadJson("scan-1.json", { ok: true });

    expect(click).toHaveBeenCalled();
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "blob:json",
    );
  });
});
