import { describe, expect, it } from "vitest";

import {
  SCAN_DETAIL_NAV_SEGMENTS,
  SCAN_DETAIL_SEGMENT_BACKEND_MODULES,
  parseScanDetailSegment,
} from "@/lib/constants/scan-detail-segment-modules";

describe("scan-detail-segment-modules", () => {
  it("defines 28 SubNav segments with backend module lists", () => {
    expect(SCAN_DETAIL_NAV_SEGMENTS).toHaveLength(28);
    for (const seg of SCAN_DETAIL_NAV_SEGMENTS) {
      expect(SCAN_DETAIL_SEGMENT_BACKEND_MODULES[seg].length).toBeGreaterThan(0);
    }
  });

  it("parseScanDetailSegment returns null on scan summary path", () => {
    const id = "abc-123";
    expect(parseScanDetailSegment(`/dashboard/scan/${id}`, id)).toBeNull();
    expect(parseScanDetailSegment(`/dashboard/scan/${id}/`, id)).toBeNull();
  });

  it("parseScanDetailSegment extracts first segment after scan id", () => {
    const id = "abc-123";
    expect(parseScanDetailSegment(`/dashboard/scan/${id}/dns`, id)).toBe("dns");
    expect(parseScanDetailSegment(`/dashboard/scan/${id}/screenshot`, id)).toBe("screenshot");
    expect(parseScanDetailSegment(`/dashboard/scan/${id}/email-config`, id)).toBe("email-config");
  });

  it("parseScanDetailSegment returns null for unknown trailing path", () => {
    const id = "abc-123";
    expect(parseScanDetailSegment(`/dashboard/scan/${id}/unknown-page`, id)).toBeNull();
  });
});
