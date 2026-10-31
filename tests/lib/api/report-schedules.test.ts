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
  rescanBeforeReport: false,
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

  it("preserves the opt-in fresh scan setting", async () => {
    const freshSchedule = { ...schedule, rescanBeforeReport: true };
    apiClientMock.post.mockResolvedValue({ data: freshSchedule });
    const mod = await import("@/lib/api/report-schedules");

    const created = await mod.createReportSchedule({
      name: "Weekly report",
      scanId: "scan-1",
      cadence: "weekly",
      timezone: "UTC",
      dayOfWeek: 0,
      hour: 9,
      minute: 0,
      deliveryChannels: [],
      emailRecipients: [],
      rescanBeforeReport: true,
    });

    expect(created.rescanBeforeReport).toBe(true);
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/report-schedules",
      expect.objectContaining({ rescanBeforeReport: true }),
    );
  });

  it("returns the scan created for a scheduled run", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        runs: [{
          id: "run-1",
          scheduleId: "schedule-1",
          reportId: "report-1",
          scanId: "fresh-scan-1",
          status: "completed",
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          deliverySummary: null,
        }],
      },
    });
    const mod = await import("@/lib/api/report-schedules");

    const result = await mod.listReportScheduleRuns("schedule-1");

    expect(result.runs[0].scanId).toBe("fresh-scan-1");
  });
});
