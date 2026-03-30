import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadJson, pickScanDetailExportSummary } from "@/lib/utils/export-json";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

describe("pickScanDetailExportSummary", () => {
  it("includes summary fields only", () => {
    const summary = pickScanDetailExportSummary(MOCK_SCAN_DETAIL);
    expect(summary).toMatchObject({
      id: MOCK_SCAN_DETAIL.id,
      domain: MOCK_SCAN_DETAIL.domain,
      url: MOCK_SCAN_DETAIL.url,
      status: MOCK_SCAN_DETAIL.status,
      securityScore: MOCK_SCAN_DETAIL.securityScore,
    });
    expect("ssl" in summary).toBe(false);
    expect(summary.keyFindings).toEqual(MOCK_SCAN_DETAIL.keyFindings);
  });
});

describe("downloadJson", () => {
  const createObjectURL = vi.fn(() => "blob:mock");
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  const origCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return { click, href: "", download: "", rel: "" } as unknown as HTMLAnchorElement;
      }
      return origCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    click.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("creates a blob download and revokes the object URL", () => {
    downloadJson("out.json", { a: 1 });

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
