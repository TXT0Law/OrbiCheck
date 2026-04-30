import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let lastBarData: Array<{ module: string; durationMs: number; status: string }> = [];
const cellFills: string[] = [];

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
    BarChart: ({
      data,
      children,
    }: {
      data: typeof lastBarData;
      children?: React.ReactNode;
    }) => {
      lastBarData = data;
      return <div data-recharts="BarChart">{children}</div>;
    },
    Bar: ({ children }: { children?: React.ReactNode }) => (
      <div data-recharts="Bar">{children}</div>
    ),
    Cell: ({ fill }: { fill: string }) => {
      cellFills.push(fill);
      return <div data-recharts="Cell" data-fill={fill} />;
    },
    CartesianGrid: passthrough("CartesianGrid"),
    XAxis: passthrough("XAxis"),
    YAxis: passthrough("YAxis"),
    Tooltip: passthrough("Tooltip"),
  };
});

import { ModuleDurationChart } from "@/components/scan/charts/module-duration-chart";

beforeEach(() => {
  cellFills.length = 0;
});

const JOBS = [
  { module: "ssl", status: "success" as const, durationMs: 4500 },
  { module: "ports", status: "failed" as const, durationMs: 12000 },
  { module: "headers", status: "success" as const, durationMs: 800 },
  { module: "tech-stack", status: "success" as const, durationMs: 0 },
  { module: "tls", status: "timed-out" as const, durationMs: 9000 },
  { module: "dns", status: "skipped" as const, durationMs: -1 },
];

describe("ModuleDurationChart", () => {
  it("filters non-positive durations and sorts the rest descending", () => {
    render(<ModuleDurationChart data={JOBS} />);

    expect(lastBarData.map((row) => row.module)).toEqual([
      "ports",
      "tls",
      "ssl",
      "headers",
    ]);
  });

  it("respects the topN limit so the chart stays scannable on small viewports", () => {
    render(<ModuleDurationChart data={JOBS} topN={2} />);

    expect(lastBarData).toHaveLength(2);
    expect(lastBarData[0].module).toBe("ports");
  });

  it("colours each bar by status so failures stand out from successes", () => {
    render(<ModuleDurationChart data={JOBS} />);

    expect(cellFills).toEqual([
      "#dc2626",
      "#ea580c",
      "#2563eb",
      "#2563eb",
    ]);
  });

  it("renders the empty state when no module reports a positive duration", () => {
    render(
      <ModuleDurationChart
        data={[{ module: "ssl", status: "skipped", durationMs: 0 }]}
        emptyMessage="nothing here"
      />,
    );

    expect(screen.getByText("nothing here")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <ModuleDurationChart data={JOBS} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
