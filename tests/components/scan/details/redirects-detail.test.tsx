import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RedirectsDetail } from "@/components/scan/details/redirects-detail";

describe("RedirectsDetail", () => {
  it("renders redirect hops and final destination", () => {
    render(
      <RedirectsDetail
        data={{
          hops: [
            { url: "http://example.com", statusCode: 301, responseTimeMs: 50 },
            { url: "https://example.com", statusCode: 200, responseTimeMs: 70 },
          ],
          totalRedirects: 1,
          finalUrl: "https://example.com",
        }}
      />,
    );

    expect(screen.getByText("Redirect Chain")).toBeInTheDocument();
    expect(screen.getByText(/Total redirects: 1/i)).toBeInTheDocument();
    expect(screen.getByText("Final Destination")).toBeInTheDocument();
  });

  it("renders unavailable state for null data", () => {
    render(<RedirectsDetail data={null} />);

    expect(
      screen.getByText("Redirect data is unavailable for this scan."),
    ).toBeInTheDocument();
  });

  it("renders empty state when no redirects exist", () => {
    render(
      <RedirectsDetail
        data={{ hops: [], totalRedirects: 0, finalUrl: "" }}
      />,
    );

    expect(screen.getByText("No redirects were detected.")).toBeInTheDocument();
  });
});
