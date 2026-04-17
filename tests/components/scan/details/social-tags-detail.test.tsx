import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SocialTagsDetail } from "@/components/scan/details/social-tags-detail";

import { LONG_URL } from "./long-value-fixtures";

describe("SocialTagsDetail", () => {
  it("renders open graph and twitter values", () => {
    render(
      <SocialTagsDetail
        data={{
          ogTitle: "Example OG",
          ogDescription: "Example description",
          ogImage: "https://example.com/og.png",
          ogUrl: "https://example.com",
          ogType: "website",
          ogSiteName: "Example",
          twitterCard: "summary",
          twitterSite: "@example",
          twitterTitle: "Twitter Example",
          twitterDescription: "Twitter description",
          twitterImage: "https://example.com/twitter.png",
        }}
      />,
    );

    expect(screen.getByText("Open Graph Tags")).toBeInTheDocument();
    expect(screen.getByText("Example OG")).toBeInTheDocument();
    expect(screen.getByText("@example")).toBeInTheDocument();
    expect(screen.getAllByAltText("Open Graph preview").length).toBe(1);
  });

  it("renders not set placeholders for null values", () => {
    render(
      <SocialTagsDetail
        data={{
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          ogUrl: null,
          ogType: null,
          ogSiteName: null,
          twitterCard: null,
          twitterSite: null,
          twitterTitle: null,
          twitterDescription: null,
          twitterImage: null,
        }}
      />,
    );

    expect(screen.getAllByText("Not set").length).toBeGreaterThan(3);
  });

  it("wraps long og:url, og:image and twitter:image values without truncation", () => {
    render(
      <SocialTagsDetail
        data={{
          ogTitle: "Example",
          ogDescription: "Example description",
          ogImage: LONG_URL,
          ogUrl: LONG_URL,
          ogType: "website",
          ogSiteName: "Example",
          twitterCard: "summary_large_image",
          twitterSite: "@example",
          twitterTitle: "Twitter Example",
          twitterDescription: "Description",
          twitterImage: LONG_URL,
        }}
      />,
    );

    const matches = screen.getAllByText(LONG_URL);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    matches.forEach((el) => {
      expect(el.className).toMatch(/break-all/);
    });
  });
});
