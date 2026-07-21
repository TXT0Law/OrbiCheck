import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScanDetail } from "@/shared/types/scan";

const apiClientMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

import { cancelScan, createScan, deleteAllScans, deleteScan, getScan, getScanDetail, listScans } from "@/lib/api/scans";

describe("scan API wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes createScan snake_case payload", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        id: "scan-1",
        url: "https://example.com",
        domain: "example.com",
        status: "pending",
        progress: 0,
        total_modules: 30,
        completed_modules: 2,
        security_score: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    });

    const result = await createScan("https://example.com");

    expect(apiClientMock.post).toHaveBeenCalledWith("/scans", {
      url: "https://example.com",
    });
    expect(result.totalModules).toBe(30);
    expect(result.completedModules).toBe(2);
    expect(result.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("createScan passes modules and port scan toggle when provided", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        id: "scan-2",
        url: "https://example.com",
        domain: "example.com",
        status: "pending",
        progress: 0,
        total_modules: 2,
        completed_modules: 0,
        security_score: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    });

    await createScan("https://example.com", {
      modules: ["ssl", "whois"],
      enablePortScan: true,
      portScanProfile: "deep",
      acknowledgeScanAuthorization: true,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith("/scans", {
      url: "https://example.com",
      modules: ["ssl", "whois"],
      enablePortScan: true,
      portScanProfile: "deep",
      acknowledgeScanAuthorization: true,
    });
  });

  it("uses defaults for partial scan payload", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        scans: [
          {
            id: "scan-2",
            url: "https://partial.test",
            domain: "partial.test",
            status: "running",
            progress: 45,
          },
        ],
        total: 1,
      },
    });

    const result = await listScans(2, 10);

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans", {
      params: { limit: 10, offset: 10 },
    });
    expect(result.total).toBe(1);
    expect(result.scans[0].totalModules).toBe(0);
    expect(result.scans[0].completedModules).toBe(0);
    expect(result.scans[0].securityScore).toBeNull();
  });

  it("passes scan list filter params", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        scans: [],
        total: 0,
      },
    });

    await listScans(1, 20, {
      search: "bilibili",
      sortBy: "created_at_desc",
      statusGroup: "active",
    });

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans", {
      params: {
        limit: 20,
        offset: 0,
        search: "bilibili",
        sort_by: "created_at_desc",
        status_group: "active",
      },
    });
  });

  it("reads a single scan", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        id: "scan-3",
        url: "https://single.test",
        domain: "single.test",
        status: "completed",
        progress: 100,
        totalModules: 30,
        completedModules: 30,
        securityScore: 10,
        errorMessage: null,
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:01:00Z",
        createdAt: "2026-01-01T00:00:00Z",
      },
    });

    const result = await getScan("scan-3");

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans/scan-3");
    expect(result.domain).toBe("single.test");
  });

  it("returns raw scan detail", async () => {
    const detail = {
      id: "scan-4",
      domain: "detail.test",
      url: "https://detail.test",
      status: "completed",
      scannedAt: null,
      duration: null,
      securityScore: null,
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
      categorySummary: [],
      keyFindings: [],
      moduleErrors: {},
    } as unknown as ScanDetail;
    apiClientMock.get.mockResolvedValueOnce({ data: detail });

    const result = await getScanDetail("scan-4");

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans/scan-4/detail");
    expect(result).toEqual(detail);
  });

  it("cancels scan", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: {} });

    await cancelScan("scan-5");

    expect(apiClientMock.post).toHaveBeenCalledWith("/scans/scan-5/cancel");
  });

  it("deletes scan", async () => {
    apiClientMock.delete.mockResolvedValueOnce({ data: {} });

    await deleteScan("scan-6");

    expect(apiClientMock.delete).toHaveBeenCalledWith("/scans/scan-6");
  });

  it("deletes all scans with filters", async () => {
    apiClientMock.delete.mockResolvedValueOnce({ data: { deleted: 3 } });

    const deleted = await deleteAllScans({
      search: "example",
      statusGroup: "active",
    });

    expect(apiClientMock.delete).toHaveBeenCalledWith("/scans", {
      params: {
        search: "example",
        status_group: "active",
      },
    });
    expect(deleted).toBe(3);
  });

  it("falls back to deleting scans one-by-one when bulk delete returns 405", async () => {
    apiClientMock.delete
      .mockRejectedValueOnce({ response: { status: 405 } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} });
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        scans: [
          {
            id: "scan-a",
            url: "https://a.test",
            domain: "a.test",
            status: "completed",
            progress: 100,
          },
          {
            id: "scan-b",
            url: "https://b.test",
            domain: "b.test",
            status: "failed",
            progress: 100,
          },
        ],
        total: 2,
      },
    });

    const deleted = await deleteAllScans({ search: "test", statusGroup: "all" });

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans", {
      params: {
        limit: 100,
        offset: 0,
        search: "test",
        sort_by: "created_at_desc",
        status_group: "all",
      },
    });
    expect(apiClientMock.delete).toHaveBeenCalledWith("/scans/scan-a");
    expect(apiClientMock.delete).toHaveBeenCalledWith("/scans/scan-b");
    expect(deleted).toBe(2);
  });
});
