import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SslWatchlist } from "@/components/dashboard/ssl-watchlist";
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

describe("SslWatchlist", () => {
  beforeEach(() => {
    useMonitorsMock.mockReset();
  });

  it("renders loading skeletons", () => {
    useMonitorsMock.mockReturnValue({ isLoading: true });

    const { container } = render(<SslWatchlist />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders SSL monitors sorted by urgency", () => {
    useMonitorsMock.mockReturnValue({
      data: { data: [buildMonitor("mon-2", 45), buildMonitor("mon-1", 5)] },
      isLoading: false,
      isError: false,
    });

    render(<SslWatchlist />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/dashboard/monitor");
    expect(links[1]).toHaveAttribute("href", "/dashboard/monitor/mon-1/ssl");
    expect(screen.getByText("Expires in 5d")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("does not render when there are no SSL monitors", () => {
    useMonitorsMock.mockReturnValue({
      data: { data: [buildMonitor("mon-1", 5, false)] },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<SslWatchlist />);

    expect(container.firstChild).toBeNull();
  });

  it("renders inline errors and retries", () => {
    const refetchMock = vi.fn();
    useMonitorsMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("Failed to load SSL watchlist"),
      refetch: refetchMock,
    });

    render(<SslWatchlist />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Failed to load SSL watchlist")).toBeInTheDocument();
    expect(refetchMock).toHaveBeenCalled();
  });
});

function buildMonitor(
  id: string,
  sslExpiryDays: number,
  enableSsl: boolean = true
): Monitor {
  return {
    id,
    displayName: `Monitor ${id}`,
    url: `https://${id}.example.com`,
    enabledCapabilities: enableSsl ? ["ssl_expiry"] : ["uptime_only"],
    capabilities: {
      uptime_only: {
        enabled: !enableSsl,
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
        enabled: enableSsl,
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
    lastResponseTimeMs: 100,
    lastChangeDetectedAt: null,
    sslExpiryDays,
    totalChecks: 1,
    uptimePercentage: 100,
    avgResponseTimeMs: 100,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
