import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let lastBarData: Array<{
  name: string;
  supportValue: number;
  secure: string;
  supported: boolean;
}> = [];
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

import { ProtocolSupportChart } from "@/components/scan/charts/protocol-support-chart";

beforeEach(() => {
  cellFills.length = 0;
});

describe("ProtocolSupportChart", () => {
  it("renders one bar per protocol with support value 1/0", () => {
    render(
      <ProtocolSupportChart
        data={[
          { name: "TLSv1.3", supported: true, secure: "good" },
          { name: "TLSv1.2", supported: true, secure: "good" },
          { name: "TLSv1.0", supported: false, secure: "warning" },
        ]}
      />,
    );

    expect(lastBarData.map((row) => row.name)).toEqual([
      "TLSv1.3",
      "TLSv1.2",
      "TLSv1.0",
    ]);
    expect(lastBarData.map((row) => row.supportValue)).toEqual([1, 1, 0]);
  });

  it("colours unsupported protocols neutral grey, regardless of severity rating", () => {
    render(
      <ProtocolSupportChart
        data={[
          { name: "SSLv3", supported: false, secure: "danger" },
          { name: "TLSv1.3", supported: true, secure: "good" },
        ]}
      />,
    );

    expect(cellFills).toEqual(["#a1a1aa", "#16a34a"]);
  });

  it("renders the empty state when no protocol rows are reported", () => {
    render(<ProtocolSupportChart data={[]} emptyMessage="no rows" />);
    expect(screen.getByText("no rows")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <ProtocolSupportChart data={[]} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
