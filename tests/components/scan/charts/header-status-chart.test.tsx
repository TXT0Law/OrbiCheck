import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

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

import { HeaderStatusChart } from "@/components/scan/charts/header-status-chart";

describe("HeaderStatusChart", () => {
  it("aggregates header status counts in canonical order", () => {
    render(
      <HeaderStatusChart
        data={[
          { name: "csp", status: "pass" },
          { name: "x-frame-options", status: "fail" },
          { name: "x-content-type-options", status: "missing" },
          { name: "referrer-policy", status: "missing" },
        ]}
      />,
    );

    expect(lastPieData.map((slice) => slice.key)).toEqual([
      "pass",
      "fail",
      "missing",
    ]);
    expect(lastPieData.map((slice) => slice.value)).toEqual([1, 1, 2]);
  });

  it("renders the empty state when no checks are reported", () => {
    render(<HeaderStatusChart data={[]} emptyMessage="no checks" />);
    expect(screen.getByText("no checks")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(<HeaderStatusChart data={[]} isLoading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
