import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AlertEmptyState } from "@/components/alerts/alert-empty-state";
import { AlertListTable } from "@/components/alerts/alert-list-table";
import { getAlertContentMessages } from "@/lib/i18n/alert-content";
import type { AlertEvent, Monitor } from "@/shared/types/monitor";

const messages = getAlertContentMessages("en");

const monitor: Monitor = {
  id: "mon-1",
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
  lastStatusCode: 200,
  lastResponseTimeMs: 123,
  lastChangeDetectedAt: null,
  sslExpiryDays: null,
  totalChecks: 1,
  uptimePercentage: 100,
  avgResponseTimeMs: 123,
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const alert: AlertEvent = {
  id: "alert-1",
  monitorId: "mon-1",
  capability: "uptime_only",
  eventType: "downtime",
  severity: "critical",
  thresholdConfig: { consecutiveFailures: 3 },
  actualValue: "consecutiveFailures:3",
  message: "Monitor is down",
  dispatchedChannels: ["sse", "webhook"],
  suppressed: false,
  suppressReason: null,
  createdAt: new Date().toISOString(),
  resolvedAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
};

describe("AlertListTable", () => {
  it("renders table with mock alert data", () => {
    render(
      <AlertListTable
        alerts={[alert]}
        monitorsById={{ [monitor.id]: monitor }}
        messages={messages}
        onSelect={vi.fn()}
        onAcknowledge={vi.fn()}
      />
    );

    expect(screen.getByText("Monitor is down")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Example Monitor" })).toHaveAttribute(
      "href",
      "/dashboard/monitor/mon-1"
    );
  });

  it("clicking acknowledge calls callback", () => {
    const onAcknowledge = vi.fn();
    render(
      <AlertListTable
        alerts={[alert]}
        monitorsById={{ [monitor.id]: monitor }}
        messages={messages}
        onSelect={vi.fn()}
        onAcknowledge={onAcknowledge}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(onAcknowledge).toHaveBeenCalledWith("alert-1");
  });

  it("severity badge renders correct variant", () => {
    render(
      <AlertListTable
        alerts={[alert]}
        monitorsById={{ [monitor.id]: monitor }}
        messages={messages}
        onSelect={vi.fn()}
        onAcknowledge={vi.fn()}
      />
    );

    expect(screen.getByTestId("alert-severity-critical")).toBeInTheDocument();
  });

  it("empty state renders when no data", () => {
    render(
      <AlertEmptyState
        title={messages.empty.title}
        description={messages.empty.description}
      />
    );

    expect(screen.getByText("No alerts yet")).toBeInTheDocument();
  });
});
