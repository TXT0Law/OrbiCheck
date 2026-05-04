import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

let lastBarData: Array<{ type: string; count: number }> = [];

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
    Bar: passthrough("Bar"),
    CartesianGrid: passthrough("CartesianGrid"),
    XAxis: passthrough("XAxis"),
    YAxis: passthrough("YAxis"),
    Tooltip: passthrough("Tooltip"),
  };
});

import { DnsRecordTypeChart } from "@/components/scan/charts/dns-record-type-chart";

describe("DnsRecordTypeChart", () => {
  it("emits one bar per record type in canonical order", () => {
    render(
      <DnsRecordTypeChart
        data={{
          a: ["1.1.1.1", "1.0.0.1"],
          aaaa: ["::1"],
          cname: [],
          mx: ["mx1", "mx2"],
          ns: ["ns1"],
          txt: [],
          soa: ["soa-record"],
        }}
      />,
    );

    expect(lastBarData.map((row) => row.type)).toEqual([
      "A",
      "AAAA",
      "CNAME",
      "MX",
      "NS",
      "TXT",
      "SOA",
    ]);
    expect(lastBarData.map((row) => row.count)).toEqual([2, 1, 0, 2, 1, 0, 1]);
  });

  it("renders the empty state when every record list is empty", () => {
    render(
      <DnsRecordTypeChart
        data={{
          a: [],
          aaaa: [],
          cname: [],
          mx: [],
          ns: [],
          txt: [],
          soa: [],
        }}
        emptyMessage="no records"
      />,
    );
    expect(screen.getByText("no records")).toBeInTheDocument();
  });

  it("renders the empty state when data is missing entirely", () => {
    render(<DnsRecordTypeChart data={null} />);
    expect(
      screen.getByText(/DNS distribution unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <DnsRecordTypeChart data={null} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
