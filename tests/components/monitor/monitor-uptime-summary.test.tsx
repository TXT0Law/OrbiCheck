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
});
