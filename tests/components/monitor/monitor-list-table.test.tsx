import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { MonitorListTable } from "@/components/monitor/monitor-list-table";
import type { Monitor } from "@/shared/types/monitor";

import { LONG_URL } from "../scan/details/long-value-fixtures";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/monitor/monitor-actions-dropdown", () => ({
  MonitorActionsDropdown: () => <div data-testid="actions-dropdown" />,
}));

function buildMonitorFixture(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "mon_test_1",
    displayName: "Example monitor",
    url: LONG_URL,
    enabledCapabilities: ["uptime_only"],
    capabilities: {
      uptime_only: {
        enabled: true,
        alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
        thresholds: {
          maxResponseTimeMs: null,
          consecutiveFailures: 3,
          alertOnUnexpectedStatus: true,
        },
        intervalOverrideSeconds: null,
      },
      content_change: {
        enabled: false,
        alert: { enabled: false, cooldownSeconds: 300, quietHours: null },
        thresholds: { alertOnChange: true, minChangeSizeBytes: null },
        intervalOverrideSeconds: null,
      },
      ssl_expiry: {
        enabled: false,
        alert: { enabled: false, cooldownSeconds: 300, quietHours: null },
        thresholds: { warnDaysRemaining: 14, criticalDaysRemaining: 3 },
        intervalOverrideSeconds: null,
      },
      visual_change: {
        enabled: false,
        alert: { enabled: false, cooldownSeconds: 300, quietHours: null },
        thresholds: {
          similarityThresholdPercent: 95,
          viewportWidth: null,
          viewportHeight: null,
          fullPage: null,
          contentCorrelationWindowSeconds: null,
        },
        intervalOverrideSeconds: null,
      },
    },
    intervalSeconds: 60,
    httpMethod: "GET",
    expectedStatusCode: 200,
    isEnabled: true,
    status: "up",
    capabilityStatuses: [],
    lastCheckAt: "2026-04-19T12:00:00Z",
    lastStatusCode: 200,
    lastResponseTimeMs: 123,
    lastChangeDetectedAt: null,
    sslExpiryDays: null,
    totalChecks: 10,
    uptimePercentage: 99.5,
    avgResponseTimeMs: 120,
    tags: [],
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-19T12:00:00Z",
    ...overrides,
  };
}

describe("MonitorListTable", () => {
  it("renders the long URL in full (no lossy truncate)", () => {
    const { container } = render(
      <MonitorListTable monitors={[buildMonitorFixture()]} />,
    );

    const urlNode = screen.getByText(LONG_URL);
    expect(urlNode).toBeInTheDocument();
    expect(urlNode.className).toMatch(/break-all/);
    expect(urlNode.getAttribute("title")).toBe(LONG_URL);
    expect(container.querySelector(".truncate")).toBeNull();
  });

  it("wraps the table in a horizontally-scrollable container with a min-width", () => {
    const { container } = render(
      <MonitorListTable monitors={[buildMonitorFixture()]} />,
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toMatch(/overflow-x-auto/);

    const table = container.querySelector("table");
    expect(table?.className ?? "").toMatch(/min-w-\[720px\]/);
  });
});
