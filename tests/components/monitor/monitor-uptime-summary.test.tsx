import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorUptimeSummary } from "@/components/monitor/monitor-uptime-summary";

const useMonitorPeriodMock = vi.fn();
const useMonitorUptimeMock = vi.fn();

vi.mock("@/lib/hooks/use-monitor-period", () => ({
  useMonitorPeriod: () => useMonitorPeriodMock(),
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitorUptime: (...args: unknown[]) => useMonitorUptimeMock(...args),
}));

describe("MonitorUptimeSummary", () => {
  it("never renders the literal string 'NaN' when payload values are NaN/null/undefined (Bug 7 regression)", () => {
    useMonitorPeriodMock.mockReturnValue({ period: "last_24h" });
    useMonitorUptimeMock.mockReturnValue({
      isLoading: false,
      data: {
        // Intentionally hostile payload — would have produced "NaN%" / "NaN ms" before Bug 7 fix.
        uptimePercentage: Number.NaN,
        avgResponseTimeMs: null,
        p95ResponseTimeMs: undefined,
        incidents: Number.NaN,
      },
    });

    const { container } = render(<MonitorUptimeSummary monitorId="mon_test" />);

    expect(container.textContent ?? "").not.toMatch(/NaN/);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  // Phase 2.1 — the P95 card now footnotes p50/p99 when the backend supplies them.
  // This covers the "extend MonitorUptimeSummary to show p50/p99" item from the Phase 2 spec.
  it("renders a p50 · p99 footer beneath the P95 card when the percentiles are present", () => {
    useMonitorPeriodMock.mockReturnValue({ period: "last_24h" });
    useMonitorUptimeMock.mockReturnValue({
      isLoading: false,
      data: {
        uptimePercentage: 99.42,
        avgResponseTimeMs: 180,
        p50ResponseTimeMs: 150,
        p95ResponseTimeMs: 410,
        p99ResponseTimeMs: 880,
        incidents: 2,
      },
    });

    render(<MonitorUptimeSummary monitorId="mon_test" />);

    const footer = screen.getByText(/p50/i);
    expect(footer.textContent ?? "").toMatch(/p50/);
    expect(footer.textContent ?? "").toMatch(/p99/);
    expect(footer.textContent ?? "").toMatch(/·/);
  });

  // Guard against accidentally rendering the footer with stale undefined slots:
  // when neither p50 nor p99 are returned the row should not appear at all.
  it("omits the percentile footer entirely when both p50 and p99 are absent", () => {
    useMonitorPeriodMock.mockReturnValue({ period: "last_24h" });
    useMonitorUptimeMock.mockReturnValue({
      isLoading: false,
      data: {
        uptimePercentage: 100,
        avgResponseTimeMs: 120,
        p95ResponseTimeMs: 250,
        incidents: 0,
      },
    });

    const { container } = render(<MonitorUptimeSummary monitorId="mon_test" />);
    expect(container.textContent ?? "").not.toMatch(/p50|p99/);
  });
});
