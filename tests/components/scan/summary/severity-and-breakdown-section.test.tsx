import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/scan/charts/severity-distribution-chart", () => ({
  SeverityDistributionChart: ({
    data,
    emptyMessage,
  }: {
    data: { critical: number; high: number; medium: number; low: number };
    emptyMessage: string;
  }) => (
    <div
      data-testid="severity-chart-mock"
      data-total={data.critical + data.high + data.medium + data.low}
      data-empty-message={emptyMessage}
    />
  ),
}));

vi.mock("@/components/scan/charts/score-breakdown-radar", () => ({
  ScoreBreakdownRadar: ({
    data,
    emptyMessage,
  }: {
    data: Record<string, number> | null | undefined;
    emptyMessage: string;
  }) => (
    <div
      data-testid="breakdown-radar-mock"
      data-has-breakdown={data ? "true" : "false"}
      data-empty-message={emptyMessage}
    />
  ),
}));

import { SeverityAndBreakdownSection } from "@/components/scan/summary/severity-and-breakdown-section";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

describe("SeverityAndBreakdownSection", () => {
  it("forwards the camelCase categoryScores when present (T1.3)", () => {
    render(
      <SeverityAndBreakdownSection
        detail={{
          ...MOCK_SCAN_DETAIL,
          securityScoreBreakdown: {
            baseScore: 70,
            confidence: 0.9,
            severityCapApplied: null,
            categoryScores: {
              transport: 80,
              httpSecurity: 60,
              threatIntel: 90,
              infrastructure: 70,
              bestPractices: 65,
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Severity Distribution")).toBeInTheDocument();
    expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    expect(screen.getByTestId("breakdown-radar-mock")).toHaveAttribute(
      "data-has-breakdown",
      "true",
    );
  });

  it("falls back to the breakdown-empty message when securityScoreBreakdown is missing", () => {
    render(<SeverityAndBreakdownSection detail={MOCK_SCAN_DETAIL} />);

    const radar = screen.getByTestId("breakdown-radar-mock");
    expect(radar).toHaveAttribute("data-has-breakdown", "false");
    expect(radar.getAttribute("data-empty-message")).toMatch(
      /Score breakdown unavailable/i,
    );
  });

  it("uses the running-state copy on both panels while scan is in progress", () => {
    render(
      <SeverityAndBreakdownSection
        detail={{
          ...MOCK_SCAN_DETAIL,
          status: "running",
          securityScoreBreakdown: undefined,
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
        }}
      />,
    );

    expect(
      screen.getByTestId("severity-chart-mock").getAttribute("data-empty-message"),
    ).toMatch(/Severity donut populates as modules finish/i);
    expect(
      screen.getByTestId("breakdown-radar-mock").getAttribute("data-empty-message"),
    ).toMatch(/once all modules contribute/i);
  });
});
