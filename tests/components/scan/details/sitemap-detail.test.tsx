import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SitemapDetail } from "@/components/scan/details/sitemap-detail";

import { LONG_URL } from "./long-value-fixtures";

describe("SitemapDetail", () => {
  it("renders summary and sample urls", () => {
    render(
      <SitemapDetail
        data={{
          exists: true,
          url: "https://example.com/sitemap.xml",
          urlCount: 2,
          sampleUrls: ["https://example.com/", "https://example.com/about"],
        }}
      />,
    );

    expect(screen.getByText("Sitemap Summary")).toBeInTheDocument();
    expect(screen.getByText("Found")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/about")).toBeInTheDocument();
  });

  it("shows empty sample url state", () => {
    render(
      <SitemapDetail
        data={{ exists: false, url: "", urlCount: 0, sampleUrls: [] }}
      />,
    );

    expect(screen.getByText("No sample URLs available.")).toBeInTheDocument();
  });

  it("wraps long sample URLs without truncation", () => {
    render(
      <SitemapDetail
        data={{
          exists: true,
          url: "https://example.com/sitemap.xml",
          urlCount: 1,
          sampleUrls: [LONG_URL],
        }}
      />,
    );

    const sampleEl = screen.getByText(LONG_URL);
    expect(sampleEl).toBeInTheDocument();
    expect(sampleEl.className).toMatch(/break-all/);
    expect(sampleEl.className).not.toMatch(/truncate/);
    expect(sampleEl.getAttribute("title")).toBe(LONG_URL);
  });
});
