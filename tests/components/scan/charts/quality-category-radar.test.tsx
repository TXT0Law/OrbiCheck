import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

let lastRadarData: Array<{ category: string; score: number }> = [];

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
    RadarChart: ({
      data,
      children,
    }: {
      data: typeof lastRadarData;
      children?: React.ReactNode;
    }) => {
      lastRadarData = data;
      return <div data-recharts="RadarChart">{children}</div>;
    },
    PolarGrid: passthrough("PolarGrid"),
    PolarAngleAxis: passthrough("PolarAngleAxis"),
    PolarRadiusAxis: passthrough("PolarRadiusAxis"),
    Radar: passthrough("Radar"),
    Tooltip: passthrough("Tooltip"),
  };
});

import { QualityCategoryRadar } from "@/components/scan/charts/quality-category-radar";

describe("QualityCategoryRadar", () => {
  it("forwards each Lighthouse category as a radar point with display score", () => {
    render(
      <QualityCategoryRadar
        data={[
          { id: "performance", title: "Performance", score: 0.9, displayScore: 90 },
          { id: "accessibility", title: "Accessibility", score: 0.8, displayScore: 80 },
          { id: "best-practices", title: "Best Practices", score: 0.7, displayScore: 70 },
          { id: "seo", title: "SEO", score: 0.6, displayScore: 60 },
        ]}
      />,
    );

    expect(lastRadarData.map((p) => p.category)).toEqual([
      "Performance",
      "Accessibility",
      "Best Practices",
      "SEO",
    ]);
    expect(lastRadarData.map((p) => p.score)).toEqual([90, 80, 70, 60]);
  });

  it("clamps out-of-range numbers so the polygon stays on the [0,100] axis", () => {
    render(
      <QualityCategoryRadar
        data={[
          { id: "a", title: "A", score: -1, displayScore: -10 },
          { id: "b", title: "B", score: 2, displayScore: 250 },
          { id: "c", title: "C", score: null, displayScore: Number.NaN },
        ]}
      />,
    );

    expect(lastRadarData[0].score).toBe(0);
    expect(lastRadarData[1].score).toBe(100);
    expect(lastRadarData[2].score).toBe(0);
  });

  it("renders the empty state when categories are absent", () => {
    render(<QualityCategoryRadar data={[]} emptyMessage="no quality data" />);
    expect(screen.getByText("no quality data")).toBeInTheDocument();
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <QualityCategoryRadar data={null} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
