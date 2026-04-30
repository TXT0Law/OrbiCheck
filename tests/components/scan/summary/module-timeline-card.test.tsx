import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/scan/charts/module-duration-chart", () => ({
  ModuleDurationChart: ({
    data,
    emptyMessage,
  }: {
    data: Array<{ module: string }>;
    emptyMessage: string;
  }) => (
    <div
      data-testid="duration-chart-mock"
      data-count={data.length}
      data-empty={emptyMessage}
    />
  ),
}));

vi.mock("@/components/scan/charts/module-status-chart", () => ({
  ModuleStatusChart: ({
    data,
    emptyMessage,
  }: {
    data: Array<{ status: string }>;
    emptyMessage: string;
  }) => (
    <div
      data-testid="status-chart-mock"
      data-count={data.length}
      data-empty={emptyMessage}
    />
  ),
}));

vi.mock("@/components/scan/module-jobs-summary", () => ({
  ModuleJobsSummary: ({ moduleJobs }: { moduleJobs: Array<{ module: string }> }) => (
    <div data-testid="jobs-summary-mock" data-count={moduleJobs.length} />
  ),
}));

import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";
import { ModuleTimelineCard } from "@/components/scan/summary/module-timeline-card";

describe("ModuleTimelineCard", () => {
  it("forwards module jobs to all charts and the appendix when jobs exist", () => {
    render(
      <ModuleTimelineCard
        detail={{
          ...MOCK_SCAN_DETAIL,
          moduleJobs: [
            { module: "ssl", status: "success", durationMs: 100 },
            { module: "ports", status: "failed", durationMs: 200 },
          ],
          totalDurationMs: 300,
        }}
      />,
    );

    expect(screen.getByTestId("duration-chart-mock")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("status-chart-mock")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("jobs-summary-mock")).toHaveAttribute("data-count", "2");
  });

  it("hides the jobs appendix and shows the empty copy when no module jobs exist", () => {
    render(
      <ModuleTimelineCard
        detail={{
          ...MOCK_SCAN_DETAIL,
          moduleJobs: [],
          totalDurationMs: 0,
          status: "completed",
        }}
      />,
    );

    expect(screen.queryByTestId("jobs-summary-mock")).toBeNull();
    expect(screen.getByTestId("duration-chart-mock").getAttribute("data-empty")).toMatch(
      /No module timing data was recorded/i,
    );
  });

  it("uses the running-state copy when the scan is still in progress", () => {
    render(
      <ModuleTimelineCard
        detail={{
          ...MOCK_SCAN_DETAIL,
          moduleJobs: [],
          status: "running",
          totalDurationMs: 0,
        }}
      />,
    );

    expect(screen.getByTestId("duration-chart-mock").getAttribute("data-empty")).toMatch(
      /Modules are still running/i,
    );
    expect(screen.getByTestId("status-chart-mock").getAttribute("data-empty")).toMatch(
      /populates as modules report results/i,
    );
  });
});
