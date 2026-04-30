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

import { ScoreBreakdownRadar } from "@/components/scan/charts/score-breakdown-radar";

describe("ScoreBreakdownRadar", () => {
  it("renders the empty/null branch with the default message when data is missing", () => {
    render(<ScoreBreakdownRadar data={null} />);
    expect(
      screen.getByText(/Score breakdown unavailable/i),
    ).toBeInTheDocument();
  });

  it("emits five categories in canonical order, mapped to camelCase keys", () => {
    render(
      <ScoreBreakdownRadar
        data={{
          transport: 90,
          httpSecurity: 50,
          threatIntel: 100,
          infrastructure: 70,
          bestPractices: 30,
        }}
      />,
    );

    expect(lastRadarData.map((d) => d.category)).toEqual([
      "Transport",
      "HTTP Security",
      "Threat Intel",
      "Infrastructure",
      "Best Practices",
    ]);
    expect(lastRadarData.map((d) => d.score)).toEqual([90, 50, 100, 70, 30]);
  });

  it("clamps out-of-range numbers so the radar polygon stays on the [0,100] axis", () => {
    render(
      <ScoreBreakdownRadar
        data={{
          transport: -5,
          httpSecurity: 250,
          threatIntel: Number.NaN,
          infrastructure: 50,
          bestPractices: 50,
        }}
      />,
    );

    expect(lastRadarData[0].score).toBe(0);
    expect(lastRadarData[1].score).toBe(100);
    expect(lastRadarData[2].score).toBe(0);
  });

  it("renders the skeleton when isLoading is set", () => {
    const { container } = render(
      <ScoreBreakdownRadar data={null} isLoading />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
