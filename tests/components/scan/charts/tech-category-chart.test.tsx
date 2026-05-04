import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

let lastBarData: Array<{ category: string; count: number }> = [];

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

import { TechCategoryChart } from "@/components/scan/charts/tech-category-chart";

describe("TechCategoryChart", () => {
  it("groups items by category and sorts buckets by count descending", () => {
    render(
      <TechCategoryChart
        data={[
          { name: "WordPress", category: "CMS", confidence: 100 },
          { name: "WP Cache", category: "CMS", confidence: 80 },
          { name: "nginx", category: "Web Server", confidence: 100 },
          { name: "React", category: "JS Framework", confidence: 90 },
          { name: "Vue", category: "JS Framework", confidence: 60 },
          { name: "GA4", category: "Analytics", confidence: 100 },
        ]}
      />,
    );

    expect(lastBarData.map((row) => row.category)).toEqual([
      "CMS",
      "JS Framework",
      "Web Server",
      "Analytics",
    ]);
    expect(lastBarData.map((row) => row.count)).toEqual([2, 2, 1, 1]);
  });

  it("respects the topN cap so very long stacks stay readable", () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      name: `Tool ${i}`,
      category: `Category ${i}`,
      confidence: 80,
    }));

    render(<TechCategoryChart data={data} topN={5} />);

    expect(lastBarData).toHaveLength(5);
  });

  it("falls back to 'Other' when an item is missing its category", () => {
    render(
      <TechCategoryChart
        data={[
          { name: "Mystery", category: "", confidence: 60 },
          { name: "Mystery 2", category: "  ", confidence: 60 },
        ]}
      />,
    );

    expect(lastBarData).toHaveLength(1);
    expect(lastBarData[0].category).toBe("Other");
    expect(lastBarData[0].count).toBe(2);
  });

  it("renders the empty state when no items are passed in", () => {
    render(<TechCategoryChart data={[]} emptyMessage="no tech" />);
    expect(screen.getByText("no tech")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(<TechCategoryChart data={[]} isLoading />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
