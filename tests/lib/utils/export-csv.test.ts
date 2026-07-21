import { describe, expect, it, vi } from "vitest";

import { downloadCsv } from "@/lib/api/download";
import {
  pickScanModuleCsvRows,
  rowsToCsv,
} from "@/lib/utils/export-csv";
import type { ScanDetail } from "@/shared/types/scan";

const baseDetail = {
  id: "scan-1",
  domain: "example.com",
  url: "https://example.com",
  scannedAt: "2026-05-04T12:00:00Z",
  duration: "12.0s",
  status: "completed",
  securityScore: 78,
  severity: { critical: 0, high: 1, medium: 1, low: 0 },
  categorySummary: [],
  keyFindings: [
    {
      id: "k1",
      severity: "high",
      module: "ssl",
      title: "SSL near expiry",
      description: "...",
    },
    {
      id: "k2",
      severity: "medium",
      module: "ssl",
      title: "SSL warning",
      description: "...",
    },
    {
      id: "k3",
      severity: "low",
      module: "headers",
      title: "Header info",
      description: "...",
    },
  ],
  moduleErrors: {
    ports: {
      module: "ports",
      frontendKey: "ports",
      status: "failed",
      message: "scan failed",
    },
  },
  moduleJobs: [
    { module: "ssl", status: "success", durationMs: 1200 },
    { module: "headers", status: "success", durationMs: 320 },
    { module: "ports", status: "failed", durationMs: 0, error: "scan failed" },
  ],
} as unknown as ScanDetail;

describe("rowsToCsv", () => {
  it("emits a header even when rows are empty", () => {
    expect(rowsToCsv([], ["a", "b"])).toBe("a,b");
  });

  it("escapes quotes, commas, and newlines per RFC 4180", () => {
    const csv = rowsToCsv(
      [
        { name: 'O"Reilly', notes: "a, b\nnext", count: 3 },
      ],
      ["name", "notes", "count"],
    );
    expect(csv.split("\n")).toEqual([
      "name,notes,count",
      `"O""Reilly","a, b`,
      'next",3',
    ]);
  });
});

describe("pickScanModuleCsvRows", () => {
  it("derives module-level rows with finding counts and severity buckets", () => {
    const rows = pickScanModuleCsvRows(baseDetail);

    expect(rows).toEqual([
      {
        module: "ssl",
        status: "success",
        duration_ms: 1200,
        severity: "high",
        key_findings_count: 2,
      },
      {
        module: "headers",
        status: "success",
        duration_ms: 320,
        severity: "low",
        key_findings_count: 1,
      },
      {
        module: "ports",
        status: "failed",
        duration_ms: 0,
        severity: "failed",
        key_findings_count: 0,
      },
    ]);
  });

  it("falls back gracefully when moduleJobs / keyFindings are missing", () => {
    const rows = pickScanModuleCsvRows({
      ...baseDetail,
      keyFindings: [],
      moduleJobs: [],
      moduleErrors: {},
    } as unknown as ScanDetail);
    expect(rows).toEqual([]);
  });
});

describe("downloadCsv", () => {
  it("triggers a download with a UTF-8 BOM-prefixed CSV", () => {
    const click = vi.fn();
    const blobCalls: { parts: BlobPart[]; options?: BlobPropertyBag }[] = [];
    const OriginalBlob = globalThis.Blob;
    class StubBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        blobCalls.push({ parts: parts ?? [], options });
      }
    }
    vi.stubGlobal("Blob", StubBlob);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:csv"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      set href(_value: string) {},
      set download(_value: string) {},
      set rel(_value: string) {},
    } as unknown as HTMLAnchorElement);

    downloadCsv("scan-1.csv", [{ a: 1, b: 2 }]);

    expect(click).toHaveBeenCalled();
    const lastCall = blobCalls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall?.options?.type).toBe("text/csv;charset=utf-8");
    expect(lastCall?.parts[0]).toBe("\ufeff");
    expect(lastCall?.parts[1]).toContain("a,b");
    expect(lastCall?.parts[1]).toContain("1,2");
    vi.unstubAllGlobals();
  });
});
