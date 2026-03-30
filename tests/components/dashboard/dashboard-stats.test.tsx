import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import type { AlertEvent, Monitor } from "@/shared/types/monitor";

const useScanListMock = vi.fn();
const useMonitorsMock = vi.fn();
const useAlertsMock = vi.fn();

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

vi.mock("@/lib/hooks/use-scan-list", () => ({
  useScanList: (...args: unknown[]) => useScanListMock(...args),
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: (...args: unknown[]) => useMonitorsMock(...args),
}));

vi.mock("@/lib/hooks/use-alerts", () => ({
  useAlerts: (...args: unknown[]) => useAlertsMock(...args),
}));

describe("DashboardStats", () => {
  beforeEach(() => {
    useScanListMock.mockReset();
    useMonitorsMock.mockReset();
    useAlertsMock.mockReset();
  });

  it("renders computed stat values with the correct links", () => {
    useScanListMock.mockReturnValue({
      data: { total: 18, scans: [] },
      isLoading: false,
      isError: false,
    });
    useMonitorsMock.mockReturnValue({
      data: { data: buildMonitors() },
      isLoading: false,
      isError: false,
    });
    useAlertsMock.mockReturnValue({
      data: { data: buildAlerts(), meta: { total: 3 } },
      isLoading: false,
      isError: false,
    });

    render(<DashboardStats />);

    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("99.0%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /total scans/i })).toHaveAttribute(
      "href",
      "/dashboard/scan"
    );
    expect(
      screen.getByRole("link", { name: /active monitors/i })
    ).toHaveAttribute("href", "/dashboard/monitor");
    expect(screen.getByRole("link", { name: /active alerts/i })).toHaveAttribute(
      "href",
      "/dashboard/alerts"
    );
  });

  it("shows a retry banner when one of the queries fails", () => {
    const refetchScans = vi.fn();
    const refetchMonitors = vi.fn();
    const refetchAlerts = vi.fn();

    useScanListMock.mockReturnValue({
      data: { total: 0, scans: [] },
      isLoading: false,
      isError: true,
      refetch: refetchScans,
    });
    useMonitorsMock.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
      refetch: refetchMonitors,
    });
    useAlertsMock.mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isLoading: false,
      isError: false,
      refetch: refetchAlerts,
    });

    render(<DashboardStats />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      screen.getByText(/Some dashboard stats could not be refreshed/i)
    ).toBeInTheDocument();
    expect(refetchScans).toHaveBeenCalled();
    expect(refetchMonitors).toHaveBeenCalled();
    expect(refetchAlerts).toHaveBeenCalled();
  });
});

function buildMonitors(): Monitor[] {
  return [
    buildMonitor({
      id: "mon-1",
      status: "up",
      uptimePercentage: 99.5,
      enabledCapabilities: ["uptime_only", "ssl_expiry"],
    }),
    buildMonitor({
      id: "mon-2",
      status: "degraded",
      uptimePercentage: 98.5,
      enabledCapabilities: ["uptime_only"],
    }),
    buildMonitor({
      id: "mon-3",
      status: "paused",
      uptimePercentage: null,
      enabledCapabilities: ["content_change"],
      isEnabled: false,
    }),
  ];
}

function buildAlerts(): AlertEvent[] {
  return [
    {
      id: "alert-1",
      monitorId: "mon-1",
      capability: "ssl_expiry",
      eventType: "ssl_warning",
      severity: "critical",
      thresholdConfig: {},
      actualValue: "7",
      message: "SSL expiring soon",
      dispatchedChannels: ["sse"],
      suppressed: false,
      suppressReason: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
    },
  ];
}

function buildMonitor(overrides: Partial<Monitor>): Monitor {
  return {
    id: overrides.id ?? "mon-default",
    displayName: "Example Monitor",
    url: "https://example.com",
    enabledCapabilities: overrides.enabledCapabilities ?? ["uptime_only"],
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
        enabled: false,
        alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
        thresholds: { alertOnChange: true, minChangeSizeBytes: null },
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
    isEnabled: overrides.isEnabled ?? true,
    status: overrides.status ?? "up",
    capabilityStatuses: [],
    lastCheckAt: null,
    lastStatusCode: 200,
    lastResponseTimeMs: 120,
    lastChangeDetectedAt: null,
    sslExpiryDays: 20,
    totalChecks: 1,
    uptimePercentage: overrides.uptimePercentage ?? 99.5,
    avgResponseTimeMs: 120,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
