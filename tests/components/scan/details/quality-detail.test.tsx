import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

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
    RadarChart: passthrough("RadarChart"),
    PolarGrid: passthrough("PolarGrid"),
    PolarAngleAxis: passthrough("PolarAngleAxis"),
    PolarRadiusAxis: passthrough("PolarRadiusAxis"),
    Radar: passthrough("Radar"),
    Tooltip: passthrough("Tooltip"),
  };
});

import { QualityDetail } from "@/components/scan/details/quality-detail";

import { LONG_URL } from "./long-value-fixtures";

describe("QualityDetail", () => {
  it("renders lighthouse categories and audits", () => {
    render(
      <QualityDetail
        data={{
          categories: [
            { id: "performance", title: "Performance", score: 0.91, displayScore: 91 },
          ],
          audits: [
            {
              id: "largest-contentful-paint",
              title: "Largest Contentful Paint",
              displayValue: "1.2 s",
              score: 0.9,
              numericValue: 1200,
            },
          ],
          fetchTime: null,
          requestedUrl: "https://example.com",
          finalUrl: "https://example.com",
          runtimeError: null,
        }}
      />,
    );

    expect(screen.getByText("Lighthouse Scores")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("Largest Contentful Paint")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Top Web Vitals (worst first)")).toBeInTheDocument();
  });

  it("filters audits by status when a chip is toggled", () => {
    render(
      <QualityDetail
        data={{
          categories: [
            { id: "performance", title: "Performance", score: 0.5, displayScore: 50 },
          ],
          audits: [
            {
              id: "good-audit",
              title: "Good audit",
              displayValue: "1.0 s",
              score: 0.95,
              numericValue: 1000,
            },
            {
              id: "bad-audit",
              title: "Bad audit",
              displayValue: "5.0 s",
              score: 0.3,
              numericValue: 5000,
            },
          ],
          fetchTime: null,
          requestedUrl: "https://example.com",
          finalUrl: "https://example.com",
          runtimeError: null,
        }}
      />,
    );

    expect(screen.getByText("Bad audit")).toBeInTheDocument();
    expect(screen.getByText("Good audit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Failing" }));

    expect(screen.getByText("Bad audit")).toBeInTheDocument();
    expect(screen.queryByText("Good audit")).not.toBeInTheDocument();
  });

  it("renders empty-state guidance when no data is available", () => {
    render(<QualityDetail data={null} />);
    expect(screen.getByText("Quality data not available")).toBeInTheDocument();
  });

  it("renders runtime error banner", () => {
    render(
      <QualityDetail
        data={{
          categories: [{ id: "seo", title: "SEO", score: 0.4, displayScore: 40 }],
          audits: [],
          fetchTime: null,
          requestedUrl: "",
          finalUrl: "",
          runtimeError: "PageSpeed upstream failed",
        }}
      />,
    );

    expect(screen.getByText(/Runtime Error:/i)).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed upstream failed/i)).toBeInTheDocument();
  });

  it("wraps long requested/final URL header without truncation", () => {
    render(
      <QualityDetail
        data={{
          categories: [{ id: "seo", title: "SEO", score: 0.5, displayScore: 50 }],
          audits: [],
          fetchTime: null,
          requestedUrl: LONG_URL,
          finalUrl: LONG_URL,
          runtimeError: null,
        }}
      />,
    );

    const url = screen.getByText(LONG_URL);
    expect(url.className).toMatch(/break-all/);
    expect(url.getAttribute("title")).toBe(LONG_URL);
  });
});
