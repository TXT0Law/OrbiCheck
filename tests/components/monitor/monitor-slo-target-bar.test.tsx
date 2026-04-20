import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonitorSloTargetBar } from "@/components/monitor/monitor-slo-target-bar";

const SLO_TARGET = 99.9;

describe("MonitorSloTargetBar", () => {
  it("renders a neutral grey 'loading' state when isLoading is true (never red)", () => {
    const { container } = render(
      <MonitorSloTargetBar
        currentUptime={null}
        period="last_24h"
        sloTarget={SLO_TARGET}
        isLoading
      />,
    );

    expect(screen.getByText(/Loading uptime/i)).toBeInTheDocument();
    expect(container.querySelector(".text-red-600, .text-red-400")).toBeNull();
    expect(container.querySelector(".bg-red-500")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders a neutral grey 'no-data' state when currentUptime is null and not loading", () => {
    const { container } = render(
      <MonitorSloTargetBar
        currentUptime={null}
        period="last_24h"
        sloTarget={SLO_TARGET}
      />,
    );

    expect(screen.getByText(/Awaiting first check/i)).toBeInTheDocument();
    expect(container.querySelector(".text-red-600, .text-red-400")).toBeNull();
    expect(container.querySelector(".bg-red-500")).toBeNull();
  });

  it("renders 'meeting' state in emerald when current uptime ≥ target", () => {
    const { container } = render(
      <MonitorSloTargetBar
        currentUptime={99.95}
        period="last_24h"
        sloTarget={SLO_TARGET}
      />,
    );

    expect(screen.getByText(/Meeting SLO target/)).toBeInTheDocument();
    expect(screen.getByText("99.950%")).toBeInTheDocument();
    expect(container.querySelector(".bg-emerald-500")).not.toBeNull();
    expect(container.querySelector(".bg-red-500")).toBeNull();
  });

  it("renders 'missing' state in red when current uptime < target", () => {
    const { container } = render(
      <MonitorSloTargetBar
        currentUptime={99}
        period="last_24h"
        sloTarget={SLO_TARGET}
      />,
    );

    expect(screen.getByText(/Below SLO target/)).toBeInTheDocument();
    expect(container.querySelector(".bg-red-500")).not.toBeNull();
  });

  it("treats NaN currentUptime as no-data (never NaN%, never red)", () => {
    const { container } = render(
      <MonitorSloTargetBar
        currentUptime={Number.NaN}
        period="last_24h"
        sloTarget={SLO_TARGET}
      />,
    );

    expect(container.textContent).not.toMatch(/NaN/);
    expect(screen.getByText(/Awaiting first check/i)).toBeInTheDocument();
    expect(container.querySelector(".bg-red-500")).toBeNull();
  });
});
