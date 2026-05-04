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

import { PortStateChart } from "@/components/scan/charts/port-state-chart";

describe("PortStateChart", () => {
  it("aggregates port states in canonical open / closed / filtered order", () => {
    render(
      <PortStateChart
        data={[
          { port: 80, protocol: "tcp", service: "http", state: "open", banner: "" },
          { port: 443, protocol: "tcp", service: "https", state: "closed", banner: "" },
          { port: 22, protocol: "tcp", service: "ssh", state: "filtered", banner: "" },
          { port: 25, protocol: "tcp", service: "smtp", state: "filtered", banner: "" },
        ]}
      />,
    );

    expect(lastPieData.map((slice) => slice.key)).toEqual([
      "open",
      "closed",
      "filtered",
    ]);
    expect(lastPieData.map((slice) => slice.value)).toEqual([1, 1, 2]);
  });

  it("renders the empty state when the entries array is empty", () => {
    render(<PortStateChart data={[]} emptyMessage="no ports" />);
    expect(screen.getByText("no ports")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(<PortStateChart data={[]} isLoading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
