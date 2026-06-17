import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
};

vi.mock("@/lib/api/client", () => ({
  apiClient: apiClientMock,
}));

const event = {
  id: "event-1",
  userId: 1,
  eventType: "scan_service.per_module_retry_completed",
  status: "succeeded",
  targetUrl: "https://example.com",
  scanId: "scan-1",
  monitorId: null,
  reportId: null,
  groupId: "group-1",
  groupRunId: "run-1",
  groupRunMemberId: null,
  durationMs: 250,
  retryCount: 2,
  errorCode: null,
  message: null,
  traceId: "scan-1",
  details: { succeeded: 2, failed: 0 },
  createdAt: "2026-06-17T00:00:00Z",
};

describe("operational events api", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads report operational events", async () => {
    apiClientMock.get.mockResolvedValue({ data: { events: [event] } });
    const mod = await import("@/lib/api/operational-events");

    const result = await mod.getReportOperationalEvents("report-1", 5);

    expect(apiClientMock.get).toHaveBeenCalledWith("/reports/report-1/events", {
      params: { limit: 5 },
    });
    expect(result.events[0].eventType).toBe("scan_service.per_module_retry_completed");
  });

  it("loads group run operational events", async () => {
    apiClientMock.get.mockResolvedValue({ data: { events: [event] } });
    const mod = await import("@/lib/api/operational-events");

    await mod.getUrlGroupRunOperationalEvents("group-1", "run-1", 10);

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/url-groups/group-1/runs/run-1/events",
      { params: { limit: 10 } }
    );
  });

  it("loads scan operational events", async () => {
    apiClientMock.get.mockResolvedValue({ data: { events: [event] } });
    const mod = await import("@/lib/api/operational-events");

    await mod.getScanOperationalEvents("scan-1", 15);

    expect(apiClientMock.get).toHaveBeenCalledWith("/scans/scan-1/events", {
      params: { limit: 15 },
    });
  });
});
