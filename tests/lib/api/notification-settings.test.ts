import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
};

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

const _channelDefault = {
  enabled: false,
  target: null as string | null,
  severityFilter: ["critical", "warning"] as ("critical" | "warning" | "info")[],
};

const _settingsResponse = {
  webhookUrl: "https://hooks.example.com",
  webhookEnabled: true,
  monitorEventsEnabled: true,
  emailEnabled: false,
  emailAddress: null,
  emailOnCritical: true,
  emailOnWarning: false,
  emailOnInfo: false,
  channels: {
    slack: { ..._channelDefault },
    discord: { ..._channelDefault },
    teams: { ..._channelDefault },
    pagerduty: { ..._channelDefault },
  },
};

describe("notification-settings api", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("gets notification settings", async () => {
    apiClientMock.get.mockResolvedValue({ data: _settingsResponse });
    const mod = await import("@/lib/api/notification-settings");

    const result = await mod.getNotificationSettings();

    expect(apiClientMock.get).toHaveBeenCalledWith("/me/notification-settings");
    expect(result.webhookEnabled).toBe(true);
    expect(result.channels.slack.enabled).toBe(false);
  });

  it("updates notification settings", async () => {
    const body = {
      ..._settingsResponse,
      emailEnabled: true,
      emailAddress: "ops@example.com",
      emailOnWarning: true,
    };
    apiClientMock.put.mockResolvedValue({ data: body });
    const mod = await import("@/lib/api/notification-settings");

    const result = await mod.updateNotificationSettings(body);

    expect(apiClientMock.put).toHaveBeenCalledWith(
      "/me/notification-settings",
      body,
    );
    expect(result.emailAddress).toBe("ops@example.com");
  });

  it("sends a test email request", async () => {
    apiClientMock.post.mockResolvedValue({ data: { sent: true, message: "ok" } });
    const mod = await import("@/lib/api/notification-settings");

    const result = await mod.sendTestEmail("ops@example.com");

    expect(apiClientMock.post).toHaveBeenCalledWith("/me/test-email", {
      emailAddress: "ops@example.com",
    });
    expect(result.sent).toBe(true);
  });

  it("sends a test notification through a channel", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        channel_id: "slack",
        success: true,
        message: "Test notification dispatched successfully.",
        latency_ms: 12,
        error: null,
        skipped_reason: null,
      },
    });
    const mod = await import("@/lib/api/notification-settings");

    const result = await mod.sendTestNotification("slack");

    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/me/notification-channels/test",
      { channel_id: "slack" },
    );
    expect(result.channelId).toBe("slack");
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBe(12);
  });
});
