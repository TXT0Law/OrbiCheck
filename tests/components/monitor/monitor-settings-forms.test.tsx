import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { MonitorCapabilitySettingsForm } from "@/components/monitor/settings/monitor-capability-settings-form";
import { MonitorGlobalSettingsForm } from "@/components/monitor/settings/monitor-global-settings-form";
import { ApiError } from "@/lib/api/client";
import type { Monitor } from "@/shared/types/monitor";

const updateMutateAsync = vi.fn();
const triggerMutateAsync = vi.fn();
const toast = vi.fn();
const updateState = { isPending: false };

const monitor: Monitor = {
  id: "mon-1",
  displayName: "Example Monitor",
  url: "https://example.com",
  enabledCapabilities: ["uptime_only", "content_change"],
  capabilities: {
    uptime_only: {
      enabled: true,
      alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
      thresholds: {
        maxResponseTimeMs: 5000,
        consecutiveFailures: 3,
        alertOnUnexpectedStatus: true,
      },
      intervalOverrideSeconds: null,
    },
    content_change: {
      enabled: true,
      alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
      thresholds: {
        alertOnChange: true,
        minChangeSizeBytes: null,
      },
      intervalOverrideSeconds: null,
    },
    ssl_expiry: {
      enabled: false,
      alert: { enabled: true, cooldownSeconds: 3600, quietHours: null },
      thresholds: { warnDaysRemaining: 30, criticalDaysRemaining: 7 },
      intervalOverrideSeconds: null,
    },
    visual_change: {
      enabled: false,
      alert: { enabled: false, cooldownSeconds: 300, quietHours: null },
      thresholds: {
        similarityThresholdPercent: 92,
        viewportWidth: 1280,
        viewportHeight: 720,
        fullPage: false,
        contentCorrelationWindowSeconds: null,
      },
      intervalOverrideSeconds: null,
    },
  },
  intervalSeconds: 300,
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("@/lib/hooks/use-monitors", () => ({
  useUpdateMonitor: () => ({
    mutateAsync: updateMutateAsync,
    isPending: updateState.isPending,
  }),
  useTriggerCheck: () => ({
    mutateAsync: triggerMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/components/monitor/monitor-detail-context", () => ({
  useMonitorDetail: () => ({ monitor }),
}));

vi.mock("@/components/monitor/monitor-interval-select", () => ({
  MonitorIntervalSelect: ({ value }: { value: number }) => <div>Interval: {value}</div>,
}));

vi.mock("@/components/monitor/settings/monitor-capability-toggle-group", () => ({
  MonitorCapabilityToggleGroup: () => <div>Capability toggle</div>,
}));

vi.mock("@/components/monitor/settings/monitor-settings-preview", () => ({
  MonitorSettingsPreview: () => <div>Preview</div>,
}));

vi.mock("@/components/monitor/settings/monitor-uptime-thresholds-form", () => ({
  MonitorUptimeThresholdsForm: () => <div>Uptime thresholds</div>,
}));

vi.mock("@/components/monitor/settings/monitor-content-thresholds-form", () => ({
  MonitorContentThresholdsForm: () => <div>Content thresholds</div>,
}));

vi.mock("@/components/monitor/settings/monitor-ssl-thresholds-form", () => ({
  MonitorSslThresholdsForm: () => <div>SSL thresholds</div>,
}));

vi.mock("@/components/monitor/settings/monitor-visual-thresholds-form", () => ({
  MonitorVisualThresholdsForm: () => <div>Visual thresholds</div>,
}));

describe("monitor settings forms", () => {
  beforeEach(() => {
    updateMutateAsync.mockReset();
    triggerMutateAsync.mockReset();
    toast.mockReset();
    updateState.isPending = false;
  });

  it("shows backend validation details on global settings save failure", async () => {
    updateMutateAsync.mockRejectedValue(
      new ApiError("Validation failed", {
        status: 422,
        details: [
          {
            loc: ["body", "intervalSeconds"],
            msg: "interval_seconds must be between 5 and 3600",
          },
        ],
      })
    );

    render(<MonitorGlobalSettingsForm monitor={monitor} />);
    fireEvent.click(screen.getByRole("button", { name: /save global settings/i }));

    await waitFor(() => {
      expect(
        screen.getByText("intervalSeconds: interval_seconds must be between 5 and 3600")
      ).toBeInTheDocument();
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Save failed",
        variant: "destructive",
      })
    );
  });

  it("renders loading state while global settings are saving", () => {
    updateState.isPending = true;

    render(<MonitorGlobalSettingsForm monitor={monitor} />);

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("shows success toast after capability settings save", async () => {
    updateMutateAsync.mockResolvedValue(monitor);

    render(
      <MonitorCapabilitySettingsForm
        monitorId={monitor.id}
        capability="uptime_only"
        config={monitor.capabilities.uptime_only}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save capability settings/i }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalled();
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Capability settings saved",
      })
    );
  });
});
