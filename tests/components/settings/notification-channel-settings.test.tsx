import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationChannelSettings } from "@/components/settings/notification-channel-settings";
import type { NotificationSettings } from "@/lib/api/notification-settings";

const getNotificationSettingsMock = vi.fn();
const updateNotificationSettingsMock = vi.fn();
const sendTestEmailMock = vi.fn();
const toastMock = vi.fn();

const defaultSettings: NotificationSettings = {
  webhookUrl: "https://example.com/hook",
  webhookEnabled: true,
  monitorEventsEnabled: true,
  emailEnabled: false,
  emailAddress: null,
  emailOnCritical: true,
  emailOnWarning: true,
  emailOnInfo: false,
};

vi.mock("@/lib/api/notification-settings", () => ({
  getNotificationSettings: () => getNotificationSettingsMock(),
  updateNotificationSettings: (body: NotificationSettings) =>
    updateNotificationSettingsMock(body),
  sendTestEmail: (email: string | null) => sendTestEmailMock(email),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe("NotificationChannelSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNotificationSettingsMock.mockResolvedValue(defaultSettings);
    updateNotificationSettingsMock.mockImplementation(async (body: NotificationSettings) => body);
    sendTestEmailMock.mockResolvedValue({
      sent: true,
      message: "Test email sent to test@example.com",
    });
  });

  it("renders email section with all fields", async () => {
    render(<NotificationChannelSettings />);

    expect(await screen.findByText("Email notifications enabled")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByText("Critical alerts")).toBeInTheDocument();
    expect(screen.getByText("Warning alerts")).toBeInTheDocument();
    expect(screen.getByText("Info alerts")).toBeInTheDocument();
  });

  it("email address input is disabled when email notifications are off", async () => {
    render(<NotificationChannelSettings />);

    const input = (await screen.findByLabelText("Email address")) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("saving includes email fields in request body", async () => {
    render(<NotificationChannelSettings />);

    const emailToggle = await screen.findByLabelText("Email notifications enabled");
    fireEvent.click(emailToggle);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "alerts@example.com" },
    });
    fireEvent.click(screen.getByLabelText("Info alerts"));
    fireEvent.click(screen.getByRole("button", { name: "Save notification settings" }));

    await waitFor(() => {
      expect(updateNotificationSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          emailEnabled: true,
          emailAddress: "alerts@example.com",
          emailOnCritical: true,
          emailOnWarning: true,
          emailOnInfo: true,
        })
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

    const input = (await screen.findByLabelText("Email address")) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe("alerts@example.com");
      expect((screen.getByLabelText("Warning alerts") as HTMLInputElement).checked).toBe(
        false
      );
    });
  });

  it("renders send test email button", async () => {
    getNotificationSettingsMock.mockResolvedValue({
      ...defaultSettings,
      emailEnabled: true,
      emailAddress: "test@example.com",
    });

    render(<NotificationChannelSettings />);

    const btn = await screen.findByRole("button", { name: /send test email/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("send test email button is disabled when email is off", async () => {
    render(<NotificationChannelSettings />);

    const btn = await screen.findByRole("button", { name: /send test email/i });
    expect(btn).toBeDisabled();
  });
});
