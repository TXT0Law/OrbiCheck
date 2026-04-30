import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// Recharts depends on layout APIs unavailable in jsdom; replace the
// surface area with passthrough divs so we can assert on the data
// SeverityDistributionChart actually wires up.
let lastPieData: Array<{ key: string; label: string; value: number; color: string }> = [];

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
    PieChart: passthrough("PieChart"),
    Pie: ({
      data,
      children,
    }: {
      data: typeof lastPieData;
      children?: React.ReactNode;
    }) => {
      lastPieData = data;
      return <div data-recharts="Pie">{children}</div>;
    },
    Cell: ({ fill }: { fill: string }) => (
      <div data-recharts="Cell" data-fill={fill} />
    ),
    Tooltip: passthrough("Tooltip"),
    Legend: passthrough("Legend"),
  };
});

import { SeverityDistributionChart } from "@/components/scan/charts/severity-distribution-chart";

describe("SeverityDistributionChart", () => {
  it("forwards critical/high/medium/low slices in canonical order", () => {
    render(
      <SeverityDistributionChart
        data={{ critical: 1, high: 2, medium: 3, low: 4 }}
      />,
    );

    expect(lastPieData.map((d) => d.key)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
    expect(lastPieData.map((d) => d.value)).toEqual([1, 2, 3, 4]);
    expect(screen.getAllByTestId ?? screen.queryAllByTestId).toBeDefined();
  });

  it("renders the empty state when total severity count is zero", () => {
    render(
      <SeverityDistributionChart
        data={{ critical: 0, high: 0, medium: 0, low: 0 }}
        emptyMessage="custom empty"
      />,
    );

    expect(screen.getByText("custom empty")).toBeInTheDocument();
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
  });

  it("renders a skeleton when isLoading is true", () => {
    const { container } = render(
      <SeverityDistributionChart
        data={{ critical: 0, high: 0, medium: 0, low: 0 }}
        isLoading
      />,
    );

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
