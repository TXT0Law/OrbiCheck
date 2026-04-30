import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreGauge } from "@/components/scan/charts/score-gauge";

describe("ScoreGauge", () => {
  it("renders the score number when a value is provided", () => {
    render(<ScoreGauge score={88} label="Performance" />);

    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Performance score: 88 out of 100"),
    ).toBeInTheDocument();
  });

  it("falls back to em-dash and a neutral label when score is null (loading / unscored states)", () => {
    render(<ScoreGauge score={null} label="Security" />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Security score: unavailable out of 100"),
    ).toBeInTheDocument();
  });

  it("clamps out-of-range scores so the SVG arc geometry stays valid", () => {
    render(<ScoreGauge score={250} label="Bad input" />);

    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("respects custom thresholds when picking the colour bucket", () => {
    const { container } = render(
      <ScoreGauge
        score={55}
        label="Custom"
        thresholds={{ good: 50, warn: 25 }}
      />,
    );

    const filledCircle = container.querySelectorAll("svg circle")[1];
    expect(filledCircle?.getAttribute("stroke")?.toLowerCase()).toBe("#16a34a");
  });

  it("skips the filled arc circle entirely when score is missing", () => {
    const { container } = render(<ScoreGauge score={undefined} label="Empty" />);
    const circles = container.querySelectorAll("svg circle");
    expect(circles).toHaveLength(1);
  });
});
