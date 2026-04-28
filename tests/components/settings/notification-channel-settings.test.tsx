import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationChannelSettings } from "@/components/settings/notification-channel-settings";
import type { NotificationSettings } from "@/shared/types/notifications";

const getNotificationSettingsMock = vi.fn();
const updateNotificationSettingsMock = vi.fn();
const sendTestEmailMock = vi.fn();
const sendTestNotificationMock = vi.fn();
const toastMock = vi.fn();

const _channelDefault = {
  enabled: false,
  target: null as string | null,
  severityFilter: ["critical", "warning"] as ("critical" | "warning" | "info")[],
};

const defaultSettings: NotificationSettings = {
  webhookUrl: "https://example.com/hook",
  webhookEnabled: true,
  monitorEventsEnabled: true,
  emailEnabled: false,
  emailAddress: null,
  emailOnCritical: true,
  emailOnWarning: true,
  emailOnInfo: false,
  channels: {
    slack: { ..._channelDefault },
    discord: { ..._channelDefault },
    teams: { ..._channelDefault },
    pagerduty: { ..._channelDefault },
  },
};

vi.mock("@/lib/api/notification-settings", () => ({
  getNotificationSettings: () => getNotificationSettingsMock(),
  updateNotificationSettings: (body: NotificationSettings) =>
    updateNotificationSettingsMock(body),
  sendTestEmail: (email: string | null) => sendTestEmailMock(email),
  sendTestNotification: (channelId: string) =>
    sendTestNotificationMock(channelId),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

async function _activateEmailTab() {
  const tab = await screen.findByRole("button", { name: "Email" });
  fireEvent.click(tab);
}

async function _activateSlackTab() {
  const tab = await screen.findByRole("button", { name: "Slack" });
  fireEvent.click(tab);
}

describe("NotificationChannelSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNotificationSettingsMock.mockResolvedValue(defaultSettings);
    updateNotificationSettingsMock.mockImplementation(
      async (body: NotificationSettings) => body,
    );
    sendTestEmailMock.mockResolvedValue({
      sent: true,
      message: "Test email sent to test@example.com",
    });
    sendTestNotificationMock.mockResolvedValue({
      channelId: "slack",
      success: true,
      message: "Test notification dispatched successfully.",
      latencyMs: 12,
      error: null,
      skippedReason: null,
    });
  });

  it("renders email section once the tab is activated", async () => {
    render(<NotificationChannelSettings />);
    await _activateEmailTab();

    expect(
      await screen.findByText("Email notifications enabled"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByText("Critical alerts")).toBeInTheDocument();
    expect(screen.getByText("Warning alerts")).toBeInTheDocument();
    expect(screen.getByText("Info alerts")).toBeInTheDocument();
  });

  it("email address input is disabled when email notifications are off", async () => {
    render(<NotificationChannelSettings />);
    await _activateEmailTab();

    const input = (await screen.findByLabelText(
      "Email address",
    )) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("saving includes email + channels fields in request body", async () => {
    render(<NotificationChannelSettings />);
    await _activateEmailTab();

    const emailToggle = await screen.findByLabelText(
      "Email notifications enabled",
    );
    fireEvent.click(emailToggle);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "alerts@example.com" },
    });
    fireEvent.click(screen.getByLabelText("Info alerts"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save notification settings" }),
    );

    await waitFor(() => {
      expect(updateNotificationSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          emailEnabled: true,
          emailAddress: "alerts@example.com",
          emailOnCritical: true,
          emailOnWarning: true,
          emailOnInfo: true,
          channels: expect.objectContaining({
            slack: expect.any(Object),
            discord: expect.any(Object),
            teams: expect.any(Object),
            pagerduty: expect.any(Object),
          }),
        }),
      );
    });
  });

  it("loads email settings from API on mount", async () => {
    getNotificationSettingsMock.mockResolvedValue({
      ...defaultSettings,
      emailEnabled: true,
      emailAddress: "alerts@example.com",
      emailOnCritical: true,
      emailOnWarning: false,
      emailOnInfo: true,
    });

    render(<NotificationChannelSettings />);
    await _activateEmailTab();

    const input = (await screen.findByLabelText(
      "Email address",
    )) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe("alerts@example.com");
      expect(
        (screen.getByLabelText("Warning alerts") as HTMLInputElement).checked,
      ).toBe(false);
    });
  });

  it("renders send test email button", async () => {
    getNotificationSettingsMock.mockResolvedValue({
      ...defaultSettings,
      emailEnabled: true,
      emailAddress: "test@example.com",
    });

    render(<NotificationChannelSettings />);
    await _activateEmailTab();

    const btn = await screen.findByRole("button", { name: /send test email/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("send test email button is disabled when email is off", async () => {
    render(<NotificationChannelSettings />);
    await _activateEmailTab();

    const btn = await screen.findByRole("button", { name: /send test email/i });
    expect(btn).toBeDisabled();
  });

  it("Slack tab renders the per-channel form", async () => {
    render(<NotificationChannelSettings />);
    await _activateSlackTab();

    expect(await screen.findByLabelText("Enable Slack")).toBeInTheDocument();
    const targetInput = screen.getByLabelText("Slack webhook URL");
    expect(targetInput).toBeInTheDocument();
    expect((targetInput as HTMLInputElement).disabled).toBe(true);
  });

  it("Slack test button stays disabled when target is invalid", async () => {
    getNotificationSettingsMock.mockResolvedValue({
      ...defaultSettings,
      channels: {
        ...defaultSettings.channels,
        slack: {
          enabled: true,
          target: "https://example.com/oops",
          severityFilter: ["critical"],
        },
      },
    });

    render(<NotificationChannelSettings />);
    await _activateSlackTab();

    const testBtn = await screen.findByRole("button", {
      name: /send test alert/i,
    });
    expect(testBtn).toBeDisabled();
    expect(
      screen.getByText("URL must start with https://hooks.slack.com/"),
    ).toBeInTheDocument();
  });
});
