import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThreatsDetail } from "@/components/scan/details/threats-detail";

describe("ThreatsDetail", () => {
  it("renders flagged threat sources", () => {
    render(
      <ThreatsDetail
        data={{
          entries: [
            { source: "safeBrowsing", listed: true, detail: "Phishing" },
            { source: "blocklist:quad9", listed: false, detail: "" },
          ],
          listedCount: 1,
        }}
      />,
    );

    expect(screen.getByText("Flagged (1)")).toBeInTheDocument();
    expect(screen.getByText("safeBrowsing")).toBeInTheDocument();
    expect(screen.getByText("Phishing")).toBeInTheDocument();
  });

  it("renders clean summary and empty source state", () => {
    render(<ThreatsDetail data={{ entries: [], listedCount: 0 }} />);

    expect(screen.getByText("Clean")).toBeInTheDocument();
    expect(
      screen.getByText("No threat intelligence sources were checked."),
    ).toBeInTheDocument();
  });
});
