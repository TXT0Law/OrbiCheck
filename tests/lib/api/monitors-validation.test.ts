import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    apiClient: apiClientMock,
    ApiError: actual.ApiError,
    getBrowserApiAbsoluteUrl: actual.getBrowserApiAbsoluteUrl,
  };
});

const INVALID_RESPONSE_CODE = "INVALID_RESPONSE_SHAPE";

const baseMonitor = {
  id: "m-1",
  displayName: "Example",
  url: "https://example.com",
  enabledCapabilities: ["uptime_only"],
  intervalSeconds: 60,
  httpMethod: "GET",
  expectedStatusCode: null,
  isEnabled: true,
  status: "up",
  capabilityStatuses: [],
  lastCheckAt: null,
  lastStatusCode: null,
  lastResponseTimeMs: null,
  lastChangeDetectedAt: null,
  sslExpiryDays: null,
  totalChecks: 0,
  uptimePercentage: null,
  avgResponseTimeMs: null,
  tags: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const baseMonitorCheck = {
  id: "chk-1",
  monitorId: "m-1",
  checkedAt: "2025-01-01T00:00:00.000Z",
  success: true,
  statusCode: 200,
  responseTimeMs: 120,
  errorType: null,
  errorMessage: null,
  contentHash: null,
  contentChanged: false,
  snapshotId: null,
  sslDaysRemaining: null,
  evaluatedCapabilities: ["uptime_only"],
};

describe("lib/api/monitors — boundary validation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("listMonitors parses a valid array payload", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [baseMonitor],
      meta: { page: 1, limit: 20, total: 1 },
    });
    const mod = await import("@/lib/api/monitors");

    const result = await mod.listMonitors();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("m-1");
    expect(result.meta?.total).toBe(1);
  });

  it("listMonitors throws ApiError(INVALID_RESPONSE_SHAPE) on non-array payload", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { not: "an array" } });
    const mod = await import("@/lib/api/monitors");

    await expect(mod.listMonitors()).rejects.toMatchObject({
      name: "ApiError",
      code: INVALID_RESPONSE_CODE,
    });
  });

  it("getMonitorChecks accepts paginated data envelopes", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [baseMonitorCheck],
        meta: { page: 1, limit: 50, total: 1 },
      },
    });
    const mod = await import("@/lib/api/monitors");

    const result = await mod.getMonitorChecks("m-1", { page: 1, limit: 50 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("chk-1");
    expect(result.meta?.total).toBe(1);
  });

  it("getMonitorChecks normalizes backend check error labels", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [{ ...baseMonitorCheck, success: false, errorType: "HTTP_ERROR" }],
    });
    const mod = await import("@/lib/api/monitors");

    const result = await mod.getMonitorChecks("m-1");
    expect(result.data[0]?.errorType).toBe("http_error");
  });

  it("getMonitorChecks accepts snake_case check fields", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [
        {
          id: "chk-1",
          monitor_id: "m-1",
          checked_at: "2025-01-01T00:00:00.000Z",
          success: false,
          status_code: 503,
          response_time_ms: 0,
          error_type: "DNS",
          error_message: "Could not resolve host",
          content_hash: null,
          content_changed: false,
          snapshot_id: null,
          ssl_days_remaining: null,
          evaluated_capabilities: ["uptime_only"],
        },
      ],
    });
    const mod = await import("@/lib/api/monitors");

    const result = await mod.getMonitorChecks("m-1");
    expect(result.data[0]?.monitorId).toBe("m-1");
    expect(result.data[0]?.errorType).toBe("dns_resolution");
  });

  it("getMonitorTimeSeries accepts the aggregated object form", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        period: "24h",
        resolution: "5m",
        points: [
          {
            timestamp: "2025-01-01T00:00:00.000Z",
            successRate: 100,
            avgResponseTime: 120,
            minResponseTime: 100,
            maxResponseTime: 140,
            checkCount: 12,
          },
        ],
      },
    });
    const mod = await import("@/lib/api/monitors");

    const series = await mod.getMonitorTimeSeries("m-1", "24h");
    expect(series.period).toBe("24h");
    expect(series.points).toHaveLength(1);
  });

  it("getMonitorTimeSeries throws on non-numeric successRate", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        period: "24h",
        resolution: "5m",
        points: [
          {
            timestamp: "2025-01-01T00:00:00.000Z",
            successRate: "definitely-not-a-number",
            avgResponseTime: 120,
            minResponseTime: 100,
            maxResponseTime: 140,
            checkCount: 12,
          },
        ],
      },
    });
    const mod = await import("@/lib/api/monitors");

    await expect(mod.getMonitorTimeSeries("m-1", "24h")).rejects.toMatchObject({
      name: "ApiError",
      code: INVALID_RESPONSE_CODE,
    });
  });

  it("getMonitorUptimeSummary parses a valid payload", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        period: "30d",
        totalChecks: 100,
        successfulChecks: 99,
        uptimePercentage: 99.0,
        avgResponseTimeMs: 250.5,
        p95ResponseTimeMs: 400,
        incidents: 1,
      },
    });
    const mod = await import("@/lib/api/monitors");

    const summary = await mod.getMonitorUptimeSummary("m-1", "30d");
    expect(summary.uptimePercentage).toBe(99.0);
    expect(summary.totalChecks).toBe(100);
  });

  it("getMonitorUptimeSummary throws when uptimePercentage is missing", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        period: "30d",
        totalChecks: 100,
        successfulChecks: 99,
        avgResponseTimeMs: 250.5,
        p95ResponseTimeMs: 400,
        incidents: 1,
      },
    });
    const mod = await import("@/lib/api/monitors");

    await expect(mod.getMonitorUptimeSummary("m-1", "30d")).rejects.toMatchObject({
      name: "ApiError",
      code: INVALID_RESPONSE_CODE,
    });
  });

  describe("subscribeMonitorUpdates", () => {
    type EventSourceLike = {
      onmessage: ((event: MessageEvent) => void) | null;
      close: () => void;
    };

    const eventSourceCtor = vi.fn();

    beforeAll(() => {
      class MockEventSource implements EventSourceLike {
        onmessage: ((event: MessageEvent) => void) | null = null;
        close = vi.fn();
        constructor(url: string) {
          eventSourceCtor(url);
        }
      }
      // Vitest jsdom env exposes globalThis but no EventSource by default.
      (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource =
        MockEventSource;
    });

    afterEach(() => {
      eventSourceCtor.mockClear();
    });

    it("drops malformed JSON without invoking the callback", async () => {
      const mod = await import("@/lib/api/monitors");
      const onUpdate = vi.fn();
      const es = mod.subscribeMonitorUpdates(onUpdate) as unknown as EventSourceLike;
      es.onmessage?.({ data: "this is not json" } as MessageEvent);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("drops heartbeat frames silently", async () => {
      const mod = await import("@/lib/api/monitors");
      const onUpdate = vi.fn();
      const es = mod.subscribeMonitorUpdates(onUpdate) as unknown as EventSourceLike;
      es.onmessage?.({ data: JSON.stringify({ type: "heartbeat" }) } as MessageEvent);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("invokes callback for well-formed monitor frames", async () => {
      const mod = await import("@/lib/api/monitors");
      const onUpdate = vi.fn();
      const es = mod.subscribeMonitorUpdates(onUpdate) as unknown as EventSourceLike;
      es.onmessage?.({
        data: JSON.stringify({ id: "m-1", event: "status_changed" }),
      } as MessageEvent);
      expect(onUpdate).toHaveBeenCalledWith({ id: "m-1", event: "status_changed" });
    });

    it("drops payloads with non-string id", async () => {
      const mod = await import("@/lib/api/monitors");
      const onUpdate = vi.fn();
      const es = mod.subscribeMonitorUpdates(onUpdate) as unknown as EventSourceLike;
      es.onmessage?.({
        data: JSON.stringify({ id: 42, event: "status_changed" }),
      } as MessageEvent);
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
});
