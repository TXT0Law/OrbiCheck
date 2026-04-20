import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorChecksTable } from "@/components/monitor/monitor-checks-table";
import type { MonitorCheck } from "@/shared/types/monitor";

const useMonitorChecksMock = vi.fn();

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitorChecks: (...args: unknown[]) => useMonitorChecksMock(...args),
}));

function buildCheckFixture(overrides: Partial<MonitorCheck> = {}): MonitorCheck {
  return {
    id: "check_1",
    monitorId: "mon_1",
    checkedAt: "2026-04-19T12:00:00Z",
    success: true,
    statusCode: 200,
    responseTimeMs: 123,
    errorType: null,
    errorMessage: null,
    contentHash: null,
    contentChanged: false,
    snapshotId: null,
    sslDaysRemaining: null,
    evaluatedCapabilities: ["uptime_only"],
    ...overrides,
  };
}

describe("MonitorChecksTable", () => {
  it("wraps the table in an overflow-x-auto container with a sensible min-width", () => {
    useMonitorChecksMock.mockReturnValue({
      data: { data: [buildCheckFixture()] },
      isLoading: false,
    });

    const { container } = render(<MonitorChecksTable monitorId="mon_1" />);

    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toMatch(/overflow-x-auto/);

    const table = container.querySelector("table");
    expect(table?.className ?? "").toMatch(/min-w-\[640px\]/);
  });
});
