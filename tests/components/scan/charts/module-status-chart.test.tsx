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

import { ModuleStatusChart } from "@/components/scan/charts/module-status-chart";

describe("ModuleStatusChart", () => {
  it("aggregates job statuses and only forwards non-zero buckets to the donut", () => {
    render(
      <ModuleStatusChart
        data={[
          { module: "ssl", status: "success", durationMs: 100 },
          { module: "tls", status: "success", durationMs: 100 },
          { module: "ports", status: "failed", durationMs: 100 },
          { module: "headers", status: "skipped", durationMs: 0 },
        ]}
      />,
    );

    expect(lastPieData.map((slice) => slice.key)).toEqual([
      "success",
      "failed",
      "skipped",
    ]);
    expect(lastPieData.map((slice) => slice.value)).toEqual([2, 1, 1]);
  });

  it("renders the empty state when the job array is empty", () => {
    render(<ModuleStatusChart data={[]} emptyMessage="no runs yet" />);
    expect(screen.getByText("no runs yet")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(<ModuleStatusChart data={[]} isLoading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
