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

import { CipherStrengthChart } from "@/components/scan/charts/cipher-strength-chart";

describe("CipherStrengthChart", () => {
  it("aggregates cipher counts grouped by strength and skips zero buckets", () => {
    render(
      <CipherStrengthChart
        data={[
          { name: "TLS_AES_256_GCM_SHA384", protocol: "TLSv1.3", strength: "strong" },
          { name: "TLS_CHACHA20_POLY1305_SHA256", protocol: "TLSv1.3", strength: "strong" },
          { name: "ECDHE-RSA-AES128-SHA256", protocol: "TLSv1.2", strength: "acceptable" },
          { name: "RC4-MD5", protocol: "TLSv1.0", strength: "insecure" },
        ]}
      />,
    );

    expect(lastPieData.map((slice) => slice.key)).toEqual([
      "strong",
      "acceptable",
      "insecure",
    ]);
    expect(lastPieData.map((slice) => slice.value)).toEqual([2, 1, 1]);
  });

  it("renders the empty state when the cipher list is empty", () => {
    render(<CipherStrengthChart data={[]} emptyMessage="no ciphers" />);
    expect(screen.getByText("no ciphers")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <CipherStrengthChart data={[]} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
