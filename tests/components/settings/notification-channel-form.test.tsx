import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationChannelForm } from "@/components/settings/notification-channel-form";
import type { ChannelConfig } from "@/shared/types/notifications";

const sendTestNotificationMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/lib/api/notification-settings", () => ({
  sendTestNotification: (channelId: string) =>
    sendTestNotificationMock(channelId),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

function _disabledConfig(): ChannelConfig {
  return {
    enabled: false,
    target: null,
    severityFilter: ["critical", "warning"],
  };
}

function _enabledSlackConfig(target: string | null): ChannelConfig {
  return {
    enabled: true,
    target,
    severityFilter: ["critical", "warning"],
  };
}

describe("NotificationChannelForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendTestNotificationMock.mockResolvedValue({
      channelId: "slack",
      success: true,
      message: "Test notification dispatched successfully.",
      latencyMs: 12,
      error: null,
      skippedReason: null,
    });
  });

  it("disables every input until the channel is enabled", () => {
    const onChange = vi.fn();
    render(
      <NotificationChannelForm
        channelId="slack"
        config={_disabledConfig()}
        onChange={onChange}
      />,
    );

    const target = screen.getByLabelText("Slack webhook URL") as HTMLInputElement;
    expect(target.disabled).toBe(true);

    const test = screen.getByRole("button", { name: /send test alert/i });
    expect(test).toBeDisabled();
  });

  it("shows a validation error for malformed Slack URLs", () => {
    const onChange = vi.fn();
    render(
      <NotificationChannelForm
        channelId="slack"
        config={_enabledSlackConfig("https://example.com/not-slack")}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByText("URL must start with https://hooks.slack.com/"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send test alert/i })).toBeDisabled();
  });

  it("rejects an obviously malformed PagerDuty integration key", () => {
    const onChange = vi.fn();
    render(
      <NotificationChannelForm
        channelId="pagerduty"
        config={{
          enabled: true,
          target: "wrong-format",
          severityFilter: ["critical"],
        }}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByText(
        /Integration key must be 20-128 chars/i,
      ),
    ).toBeInTheDocument();
  });

  it("invokes sendTestNotification with the channel id when the test button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <NotificationChannelForm
        channelId="slack"
        config={_enabledSlackConfig(
          "https://hooks.slack.com/services/AAA/BBB/CCC",
        )}
        onChange={onChange}
      />,
    );

    const btn = screen.getByRole("button", { name: /send test alert/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    await waitFor(() => {
      expect(sendTestNotificationMock).toHaveBeenCalledWith("slack");
    });
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test sent" }),
      );
    });
  });

  it("emits onChange when the user toggles a severity chip", () => {
    const onChange = vi.fn();
    render(
      <NotificationChannelForm
        channelId="discord"
        config={{
          enabled: true,
          target: "https://discord.com/api/webhooks/123/abc",
          severityFilter: ["critical", "warning"],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByLabelText("Forward info alerts to Discord"),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        severityFilter: expect.arrayContaining(["info"]),
      }),
    );
  });

  it("blocks deselecting the last severity (UI guard)", () => {
    const onChange = vi.fn();
    render(
      <NotificationChannelForm
        channelId="teams"
        config={{
          enabled: true,
          target:
            "https://example.webhook.office.com/webhookb2/00000000-0000-0000-0000-000000000000@00000000-0000-0000-0000-000000000000/IncomingWebhook/abcdef/00000000-0000-0000-0000-000000000000",
          severityFilter: ["critical"],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByLabelText("Forward critical alerts to Microsoft Teams"),
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
