import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api/client", () => ({
  apiClient: apiClientMock,
}));

describe("scans api — Phase 5 trend + diff helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the per-domain timeline with default options", async () => {
    apiClientMock.get.mockResolvedValue({
      data: { domain: "example.com", points: [] },
    });
    const mod = await import("@/lib/api/scans");

    const result = await mod.getScanDomainTimeline("example.com");

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/scans/by-domain/example.com/timeline",
      undefined,
    );
    expect(result.domain).toBe("example.com");
    expect(result.points).toEqual([]);
  });

  it("forwards range + limit when provided", async () => {
    apiClientMock.get.mockResolvedValue({
      data: { domain: "example.com", points: [] },
    });
    const mod = await import("@/lib/api/scans");

    await mod.getScanDomainTimeline("example.com", { range: "30d", limit: 5 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/scans/by-domain/example.com/timeline",
      { params: { range: "30d", limit: 5 } },
    );
  });

  it("URL-encodes the domain for the timeline endpoint", async () => {
    apiClientMock.get.mockResolvedValue({
      data: { domain: "weird domain.com", points: [] },
    });
    const mod = await import("@/lib/api/scans");

    await mod.getScanDomainTimeline("weird domain.com");

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/scans/by-domain/weird%20domain.com/timeline",
      undefined,
    );
  });

  it("returns an empty result when domain is blank without hitting the API", async () => {
    const mod = await import("@/lib/api/scans");

    const result = await mod.getScanDomainTimeline("   ");

    expect(apiClientMock.get).not.toHaveBeenCalled();
    expect(result).toEqual({ domain: "", points: [] });
  });

  it("queries the diff endpoint with both scan IDs as params", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        baseScanId: "abc",
        compareScanId: "def",
        baseDomain: "example.com",
        compareDomain: "example.com",
        baseCompletedAt: null,
        compareCompletedAt: null,
        baseScore: null,
        compareScore: null,
        addedFindings: [],
        removedFindings: [],
        severityDelta: {
          base: { critical: 0, high: 0, medium: 0, low: 0 },
          compare: { critical: 0, high: 0, medium: 0, low: 0 },
          delta: { critical: 0, high: 0, medium: 0, low: 0 },
        },
        breakdownDelta: { base: null, compare: null, delta: null },
      },
    });
    const mod = await import("@/lib/api/scans");

    const result = await mod.getScanDiff("abc", "def");

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans/diff", {
      params: { baseId: "abc", compareId: "def" },
    });
    expect(result.baseScanId).toBe("abc");
    expect(result.compareScanId).toBe("def");
  });
});
