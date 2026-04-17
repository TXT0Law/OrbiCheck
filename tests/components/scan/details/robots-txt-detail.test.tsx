import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RobotsTxtDetail } from "@/components/scan/details/robots-txt-detail";

describe("RobotsTxtDetail", () => {
  it("renders found robots.txt content and paths", () => {
    render(
      <RobotsTxtDetail
        data={{
          exists: true,
          rawContent: "User-agent: *",
          allowedPaths: ["/public"],
          disallowedPaths: ["/admin"],
          sitemapUrls: ["https://example.com/sitemap.xml"],
        }}
      />,
    );

    expect(screen.getByText("Found")).toBeInTheDocument();
    expect(screen.getByText("/public")).toBeInTheDocument();
    expect(screen.getByText("/admin")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/sitemap.xml")).toBeInTheDocument();
  });

  it("renders unavailable state for null data", () => {
    render(<RobotsTxtDetail data={null} />);
    expect(
      screen.getByText("robots.txt data is unavailable for this scan."),
    ).toBeInTheDocument();
  });

  it("renders empty states for missing path lists", () => {
    render(
      <RobotsTxtDetail
        data={{
          exists: false,
          rawContent: "",
          allowedPaths: [],
          disallowedPaths: [],
          sitemapUrls: [],
        }}
      />,
    );

    expect(screen.getByText("No allowed paths listed.")).toBeInTheDocument();
    expect(screen.getByText("No disallowed paths listed.")).toBeInTheDocument();
  });

  it("wraps long raw content and sitemap URL entries", () => {
    const longRawLine = `Disallow: /a/very/long/path/segment/${"x".repeat(200)}`;
    const longRaw = `User-agent: *\n${longRawLine}\nSitemap: https://example.com/${"y".repeat(150)}/sitemap.xml`;
    const longSitemap = `https://example.com/sitemaps/${"z".repeat(180)}/index.xml`;
    const longPath = `/admin/${"q".repeat(160)}`;

    const { container } = render(
      <RobotsTxtDetail
        data={{
          exists: true,
          rawContent: longRaw,
          allowedPaths: [],
          disallowedPaths: [longPath],
          sitemapUrls: [longSitemap],
        }}
      />,
    );

    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain(longRawLine);
    expect(pre!.className).toMatch(/break-all/);
    expect(pre!.className).toMatch(/whitespace-pre-wrap/);

    const path = screen.getByText(longPath);
    expect(path.className).toMatch(/break-all/);

    const sitemap = screen.getByText(longSitemap);
    expect(sitemap.className).toMatch(/break-all/);
    expect(sitemap.getAttribute("title")).toBe(longSitemap);
  });
});
