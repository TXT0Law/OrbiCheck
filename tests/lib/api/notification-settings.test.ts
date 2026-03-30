import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
};

vi.mock("@/lib/api/client", () => ({
  apiClient: apiClientMock,
}));

describe("notification-settings api", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("gets notification settings", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        webhookUrl: "https://hooks.example.com",
        webhookEnabled: true,
        monitorEventsEnabled: true,
        emailEnabled: false,
        emailAddress: null,
        emailOnCritical: true,
        emailOnWarning: false,
        emailOnInfo: false,
      },
    });
    const mod = await import("@/lib/api/notification-settings");

    const result = await mod.getNotificationSettings();

    expect(apiClientMock.get).toHaveBeenCalledWith("/me/notification-settings");
    expect(result.webhookEnabled).toBe(true);
  });

  it("updates notification settings", async () => {
    const body = {
      webhookUrl: "https://hooks.example.com",
      webhookEnabled: true,
      monitorEventsEnabled: true,
      emailEnabled: true,
      emailAddress: "ops@example.com",
      emailOnCritical: true,
      emailOnWarning: true,
      emailOnInfo: false,
    };
    apiClientMock.put.mockResolvedValue({ data: body });
    const mod = await import("@/lib/api/notification-settings");

    const result = await mod.updateNotificationSettings(body);

    expect(apiClientMock.put).toHaveBeenCalledWith("/me/notification-settings", body);
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
});
