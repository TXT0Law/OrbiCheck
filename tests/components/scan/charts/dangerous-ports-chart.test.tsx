import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { DANGEROUS_PORTS } from "@/shared/constants/dangerous-ports";

let lastBarData: Array<{ label: string; dangerous: number; normal: number }> = [];

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
    Cell: ({ fill }: { fill: string }) => (
      <div data-recharts="Cell" data-fill={fill} />
    ),
    CartesianGrid: passthrough("CartesianGrid"),
    XAxis: passthrough("XAxis"),
    YAxis: passthrough("YAxis"),
    Tooltip: passthrough("Tooltip"),
  };
});

import { DangerousPortsChart } from "@/components/scan/charts/dangerous-ports-chart";

describe("DangerousPortsChart", () => {
  it("partitions open ports into high-risk vs routine using the shared dangerous list", () => {
    render(
      <DangerousPortsChart
        data={[
          { port: 23, protocol: "tcp", service: "telnet", state: "open", banner: "" },
          { port: 80, protocol: "tcp", service: "http", state: "open", banner: "" },
          { port: 443, protocol: "tcp", service: "https", state: "open", banner: "" },
        ]}
        dangerousPorts={DANGEROUS_PORTS}
      />,
    );

    expect(lastBarData).toHaveLength(1);
    expect(lastBarData[0].dangerous).toBe(1);
    expect(lastBarData[0].normal).toBe(2);
  });

  it("includes a textual legend that mirrors the encoded counts", () => {
    render(
      <DangerousPortsChart
        data={[
          { port: 21, protocol: "tcp", service: "ftp", state: "open", banner: "" },
          { port: 23, protocol: "tcp", service: "telnet", state: "open", banner: "" },
          { port: 80, protocol: "tcp", service: "http", state: "open", banner: "" },
        ]}
        dangerousPorts={DANGEROUS_PORTS}
      />,
    );

    expect(screen.getByText(/High-risk \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Routine \(1\)/)).toBeInTheDocument();
  });

  it("renders the empty state when no open ports are passed in", () => {
    render(
      <DangerousPortsChart
        data={[]}
        dangerousPorts={DANGEROUS_PORTS}
        emptyMessage="no open ports"
      />,
    );

    expect(screen.getByText("no open ports")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <DangerousPortsChart data={[]} dangerousPorts={DANGEROUS_PORTS} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
