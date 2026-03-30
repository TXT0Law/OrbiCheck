import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QualityDetail } from "@/components/scan/details/quality-detail";

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
});
