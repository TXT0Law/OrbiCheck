import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Recharts depends on layout APIs unavailable in jsdom; replace its
// surface area with passthrough divs so we can assert the data wiring
// without booting an SVG layout engine.
let lastLineDataKeys: string[] = [];

vi.mock("recharts", () => {
  const passthrough = (name: string) => {
    const Component = (props: { children?: React.ReactNode }) => (
      <div data-recharts={name}>{props.children}</div>
    );
    Component.displayName = `Mock(${name})`;
    return Component;
  };
  return {
    ResponsiveContainer: passthrough("ResponsiveContainer"),
    LineChart: passthrough("LineChart"),
    CartesianGrid: passthrough("CartesianGrid"),
    XAxis: passthrough("XAxis"),
    YAxis: passthrough("YAxis"),
    Tooltip: passthrough("Tooltip"),
    Line: ({ dataKey }: { dataKey: string }) => {
      lastLineDataKeys.push(dataKey);
      return <div data-recharts="Line" data-key={dataKey} />;
    },
  };
});

import { ScanTrendChart } from "@/components/scan/charts/scan-trend-chart";

describe("ScanTrendChart", () => {
  beforeEach(() => {
    lastLineDataKeys = [];
  });

  it("renders both the score and severity lines for ≥2 points", () => {
    render(
      <ScanTrendChart
        data={[
          {
            scanId: "a",
            completedAt: "2026-04-01T00:00:00Z",
            securityScore: 70,
            severity: { critical: 0, high: 1, medium: 2, low: 3 },
          },
          {
            scanId: "b",
            completedAt: "2026-05-01T00:00:00Z",
            securityScore: 82,
            severity: { critical: 0, high: 0, medium: 1, low: 4 },
          },
        ]}
      />,
    );

    expect(lastLineDataKeys).toEqual(["securityScore", "totalSeverity"]);
    expect(screen.getByText(/security score/i)).toBeInTheDocument();
    expect(screen.getByText(/total severity/i)).toBeInTheDocument();
  });

  it("renders the empty state when there are no points", () => {
    render(<ScanTrendChart data={[]} emptyMessage="custom empty" />);

    expect(screen.getByText("custom empty")).toBeInTheDocument();
    expect(lastLineDataKeys).toHaveLength(0);
  });

  it("shows the single-point hint when only one scan exists", () => {
    render(
      <ScanTrendChart
        data={[
          {
            scanId: "a",
            completedAt: "2026-04-01T00:00:00Z",
            securityScore: 70,
            severity: { critical: 0, high: 1, medium: 2, low: 3 },
          },
        ]}
      />,
    );

    expect(screen.getByText(/need more scans/i)).toBeInTheDocument();
    expect(lastLineDataKeys).toHaveLength(0);
  });

  it("renders a skeleton when isLoading is true", () => {
    const { container } = render(<ScanTrendChart data={[]} isLoading />);

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(lastLineDataKeys).toHaveLength(0);
  });

  it("ignores points with a null completedAt", () => {
    render(
      <ScanTrendChart
        data={[
          {
            scanId: "a",
            completedAt: null,
            securityScore: 70,
            severity: { critical: 0, high: 1, medium: 2, low: 3 },
          },
          {
            scanId: "b",
            completedAt: "2026-05-01T00:00:00Z",
            securityScore: 82,
            severity: { critical: 0, high: 0, medium: 1, low: 4 },
          },
        ]}
      />,
    );

    // After filtering, only one point survives → single-point hint.
    expect(screen.getByText(/need more scans/i)).toBeInTheDocument();
    expect(lastLineDataKeys).toHaveLength(0);
  });
});
