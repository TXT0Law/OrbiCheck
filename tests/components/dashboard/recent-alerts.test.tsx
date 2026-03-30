import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentAlerts } from "@/components/dashboard/recent-alerts";
import type { AlertEvent, Monitor } from "@/shared/types/monitor";

const useAlertsMock = vi.fn();
const useMonitorsMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/use-alerts", () => ({
  useAlerts: (...args: unknown[]) => useAlertsMock(...args),
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: (...args: unknown[]) => useMonitorsMock(...args),
}));

vi.mock("@/lib/hooks/use-appearance-language", () => ({
  useAppearanceLanguage: () => "en",
}));

vi.mock("@/components/common/time-ago", () => ({
  TimeAgo: () => <span>just now</span>,
}));

vi.mock("@/components/alerts/alert-detail-sheet", () => ({
  AlertDetailSheet: ({
    open,
    alert,
  }: {
    open: boolean;
    alert: AlertEvent | null;
  }) => (open ? <div>Alert detail: {alert?.message}</div> : null),
}));

describe("RecentAlerts", () => {
  beforeEach(() => {
    useAlertsMock.mockReset();
    useMonitorsMock.mockReset();
  });

  it("renders loading skeletons", () => {
    useAlertsMock.mockReturnValue({ isLoading: true });
    useMonitorsMock.mockReturnValue({ isLoading: true });

    const { container } = render(<RecentAlerts />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders alert rows and opens the detail sheet", () => {
    useAlertsMock.mockReturnValue({
      data: { data: [buildAlert()] },
      isLoading: false,
      isError: false,
    });
    useMonitorsMock.mockReturnValue({
      data: { data: [buildMonitor()] },
      isLoading: false,
      isError: false,
    });

    render(<RecentAlerts />);
    fireEvent.click(screen.getByRole("button", { name: /ssl expiring soon/i }));

    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("Alert detail: SSL expiring soon")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view all alerts/i })
    ).toHaveAttribute("href", "/dashboard/alerts");
  });

  it("renders the empty state", () => {
    useAlertsMock.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    useMonitorsMock.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<RecentAlerts />);

    expect(screen.getByText("No active alerts.")).toBeInTheDocument();
  });

  it("renders inline errors and retries both queries", () => {
    const refetchAlerts = vi.fn();
    const refetchMonitors = vi.fn();
    useAlertsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("Failed to load alerts"),
      refetch: refetchAlerts,
    });
    useMonitorsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: refetchMonitors,
    });

    render(<RecentAlerts />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Failed to load alerts")).toBeInTheDocument();
    expect(refetchAlerts).toHaveBeenCalled();
    expect(refetchMonitors).toHaveBeenCalled();
  });
});

function buildMonitor(): Monitor {
  return {
    id: "mon-1",
    displayName: "Example Monitor",
    url: "https://example.com",
    enabledCapabilities: ["ssl_expiry"],
    capabilities: {
      uptime_only: {
        enabled: false,
        alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
        thresholds: {
          maxResponseTimeMs: 5000,
          consecutiveFailures: 3,
          alertOnUnexpectedStatus: true,
        },
        intervalOverrideSeconds: null,
      },
      content_change: {
        enabled: false,
        alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
        thresholds: { alertOnChange: true, minChangeSizeBytes: null },
        intervalOverrideSeconds: null,
      },
      ssl_expiry: {
        enabled: true,
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
    lastStatusCode: 200,
    lastResponseTimeMs: 120,
    lastChangeDetectedAt: null,
    sslExpiryDays: 12,
    totalChecks: 1,
    uptimePercentage: 99.9,
    avgResponseTimeMs: 120,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildAlert(): AlertEvent {
  return {
    id: "alert-1",
    monitorId: "mon-1",
    capability: "ssl_expiry",
    eventType: "ssl_warning",
    severity: "warning",
    thresholdConfig: {},
    actualValue: "12",
    message: "SSL expiring soon",
    dispatchedChannels: ["sse"],
    suppressed: false,
    suppressReason: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
  };
}
