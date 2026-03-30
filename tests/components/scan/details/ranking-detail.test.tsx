import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RankingDetail } from "@/components/scan/details/ranking-detail";

describe("RankingDetail", () => {
  it("renders ranking and carbon metrics", () => {
    render(
      <RankingDetail
        data={{
          ranking: {
            globalRank: 1234,
            countryRank: 45,
            categoryRank: 8,
            country: "United States",
            category: "Technology",
          },
          carbon: {
            isGreen: true,
            co2PerPageview: 0.3,
            cleanerThanPercent: 80,
            energyPerVisit: 0.1,
          },
        }}
      />,
    );

    expect(screen.getByText("#1,234")).toBeInTheDocument();
    expect(screen.getByText("Green Hosted")).toBeInTheDocument();
    expect(screen.getByText("80% of pages tested")).toBeInTheDocument();
  });

  it("renders unranked and non-green defaults", () => {
    render(
      <RankingDetail
        data={{
          ranking: null,
          carbon: null,
        }}
      />,
    );

    expect(screen.getByText("Unranked")).toBeInTheDocument();
    expect(screen.getByText("Not Green")).toBeInTheDocument();
  });
});
