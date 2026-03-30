import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonitorHealth } from "@/components/dashboard/monitor-health";
import type { Monitor } from "@/shared/types/monitor";

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

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: (...args: unknown[]) => useMonitorsMock(...args),
}));

vi.mock("@/components/common/time-ago", () => ({
  TimeAgo: () => <span>2m ago</span>,
}));

describe("MonitorHealth", () => {
  beforeEach(() => {
    useMonitorsMock.mockReset();
  });

  it("renders loading skeletons", () => {
    useMonitorsMock.mockReturnValue({ isLoading: true });

    const { container } = render(<MonitorHealth />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders monitor rows and navigation links", () => {
    useMonitorsMock.mockReturnValue({
      data: { data: [buildMonitor("mon-1"), buildMonitor("mon-2", "paused")] },
      isLoading: false,
      isError: false,
    });

    render(<MonitorHealth />);

    expect(screen.getAllByText("example.com")).toHaveLength(2);
    expect(screen.getAllByText("99.2% uptime")).toHaveLength(2);
    expect(screen.getAllByText("240 ms")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: /view all 2 monitors/i })
    ).toHaveAttribute("href", "/dashboard/monitor");
    expect(screen.getAllByRole("link", { name: /example.com/i })[0]).toHaveAttribute(
      "href",
      "/dashboard/monitor/mon-1"
    );
  });

  it("renders the empty state with add monitor CTA", () => {
    useMonitorsMock.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });

    render(<MonitorHealth />);

    expect(screen.getByText("No monitors configured.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add monitor/i })).toHaveAttribute(
      "href",
      "/dashboard/monitor/new"
    );
  });

  it("renders inline errors and retries", () => {
    const refetchMock = vi.fn();
    useMonitorsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("Failed to load monitors"),
      refetch: refetchMock,
    });

    render(<MonitorHealth />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Failed to load monitors")).toBeInTheDocument();
    expect(refetchMock).toHaveBeenCalled();
  });
});

function buildMonitor(id: string, status: Monitor["status"] = "up"): Monitor {
  return {
    id,
    displayName: "Example Monitor",
    url: "https://example.com",
    enabledCapabilities: ["uptime_only"],
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
    isEnabled: status !== "paused",
    status,
    capabilityStatuses: [],
    lastCheckAt: new Date().toISOString(),
    lastStatusCode: 200,
    lastResponseTimeMs: 240,
    lastChangeDetectedAt: null,
    sslExpiryDays: null,
    totalChecks: 1,
    uptimePercentage: 99.2,
    avgResponseTimeMs: 240,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
