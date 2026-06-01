import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api/client", () => ({
  apiClient: apiClientMock,
  ApiError: class ApiError extends Error {},
}));

const schedule = {
  id: "schedule-1",
  userId: 1,
  name: "Weekly report",
  scanId: "scan-1",
  monitorId: null,
  monitorPeriod: "30d",
  format: "pdf",
  cadence: "weekly",
  timezone: "UTC",
  dayOfWeek: 0,
  dayOfMonth: null,
  hour: 9,
  minute: 0,
  deliveryChannels: ["email"],
  emailRecipients: ["security@example.com"],
  isEnabled: true,
  lastRunAt: null,
  nextRunAt: "2026-06-01T09:00:00Z",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  recentRuns: [],
};

describe("report schedules api", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists and creates schedules", async () => {
    apiClientMock.get.mockResolvedValue({ data: { schedules: [schedule] } });
    apiClientMock.post.mockResolvedValue({ data: schedule });
    const mod = await import("@/lib/api/report-schedules");

    const listed = await mod.listReportSchedules();
    const created = await mod.createReportSchedule({
      name: "Weekly report",
      scanId: "scan-1",
      cadence: "weekly",
      timezone: "UTC",
      dayOfWeek: 0,
      hour: 9,
      minute: 0,
      deliveryChannels: ["email"],
      emailRecipients: ["security@example.com"],
    });

    expect(listed.schedules[0].id).toBe("schedule-1");
    expect(created.name).toBe("Weekly report");
    expect(apiClientMock.get).toHaveBeenCalledWith("/report-schedules");
  });

  it("runs a schedule now", async () => {
    apiClientMock.post.mockResolvedValue({ data: { runId: "run-1" } });
    const mod = await import("@/lib/api/report-schedules");

    const result = await mod.runReportScheduleNow("schedule-1");

    expect(result.runId).toBe("run-1");
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/report-schedules/schedule-1/run-now",
      {},
    );
  });
});
