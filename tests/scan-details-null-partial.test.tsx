import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArchivesDetail } from "@/components/scan/details/archives-detail";
import { CookiesDetail } from "@/components/scan/details/cookies-detail";
import { DnsDetail } from "@/components/scan/details/dns-detail";
import { EmailConfigDetail } from "@/components/scan/details/email-config-detail";
import { FirewallDetail } from "@/components/scan/details/firewall-detail";
import { DnssecDetail } from "@/components/scan/details/dnssec-detail";
import { FeaturesDetail } from "@/components/scan/details/features-detail";
import { LinkedPagesDetail } from "@/components/scan/details/linked-pages-detail";
import { PortsDetail } from "@/components/scan/details/ports-detail";
import { QualityDetail } from "@/components/scan/details/quality-detail";
import { RedirectsDetail } from "@/components/scan/details/redirects-detail";
import { RobotsTxtDetail } from "@/components/scan/details/robots-txt-detail";
import { SitemapDetail } from "@/components/scan/details/sitemap-detail";
import { ScreenshotDetail } from "@/components/scan/details/screenshot-detail";
import { StatusDetail } from "@/components/scan/details/status-detail";
import { TechStackDetail } from "@/components/scan/details/tech-stack-detail";
import { ThreatsDetail } from "@/components/scan/details/threats-detail";
import { TracerouteDetail } from "@/components/scan/details/traceroute-detail";
import { WhoisDetail } from "@/components/scan/details/whois-detail";

describe("scan detail components null/partial guards", () => {
  it("renders WHOIS fallback when data is null", () => {
    render(<WhoisDetail data={null} />);

    expect(screen.getByText("WHOIS data is unavailable for this scan.")).toBeInTheDocument();
  });

  it("renders ports table for partial port payload", () => {
    render(
      <PortsDetail
        data={[
          {
            port: 443,
            protocol: "tcp",
            service: "https",
            state: "open",
            banner: "",
          },
        ]}
      />
    );

    expect(screen.getByText("Open Port Scan")).toBeInTheDocument();
    expect(screen.getByText("443")).toBeInTheDocument();
  });

  it("renders traceroute safely with empty hops", () => {
    render(
      <TracerouteDetail
        data={{
          hops: [],
          totalHops: 0,
          destinationReached: false,
        }}
      />
    );

    expect(screen.getByText("No hops were returned by traceroute.")).toBeInTheDocument();
  });

  it("renders redirects safely when hops are missing", () => {
    render(
      <RedirectsDetail
        data={{
          hops: [],
          totalRedirects: 0,
          finalUrl: "",
        }}
      />
    );

    expect(screen.getByText("No redirects were detected.")).toBeInTheDocument();
  });

  it("renders tech stack fallback when data is null", () => {
    render(<TechStackDetail data={null} />);

    expect(screen.getByText("No technology fingerprint data is available for this scan.")).toBeInTheDocument();
  });

  it("renders features fallback for malformed payload", () => {
    render(<FeaturesDetail data={{} as never} />);

    expect(screen.getByText("No feature profile data is available for this scan.")).toBeInTheDocument();
  });

  it("renders screenshot fallback when image is unavailable", () => {
    render(<ScreenshotDetail data={{ imageUrl: "", viewport: "", capturedAt: "" }} />);

    expect(screen.getByText("Screenshot is unavailable for this scan.")).toBeInTheDocument();
  });

  it("renders img for data: URL (base64) to avoid Next.js Image restriction", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const { container } = render(
      <ScreenshotDetail
        data={{
          imageUrl: dataUrl,
          viewport: "1280x720",
          capturedAt: "2024-01-01",
        }}
      />
    );

    const img = container.querySelector("img[src^='data:']");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("alt", "Scan capture");
  });

  it("renders page source when available", () => {
    const mockPageSource = {
      html: "<!DOCTYPE html>\n<html>\n<head></head>\n<body>Hello</body>\n</html>",
      statusCode: 200,
      contentType: "text/html",
      contentLength: 60,
      truncated: false,
    };
    render(<ScreenshotDetail screenshot={null} pageSource={mockPageSource} />);
    expect(screen.getByText(/Page Source \(HTML\)/)).toBeInTheDocument();
    expect(document.getElementById("page-source")).toBeTruthy();
    expect(screen.getByText(/<!DOCTYPE html>/)).toBeInTheDocument();
  });

  it("shows unavailable when no page source", () => {
    render(<ScreenshotDetail screenshot={null} pageSource={null} />);
    expect(screen.getByText(/Page source is unavailable/)).toBeInTheDocument();
  });

  it("shows HTTP status badge when page source has statusCode", () => {
    const mockPageSource = {
      html: "<html></html>",
      statusCode: 200,
      contentType: "text/html",
      contentLength: 14,
      truncated: false,
    };
    render(<ScreenshotDetail screenshot={null} pageSource={mockPageSource} />);
    expect(screen.getByText("HTTP 200")).toBeInTheDocument();
  });

  it("renders robots.txt fallback when data is null", () => {
    render(<RobotsTxtDetail data={null} />);

    expect(screen.getByText("robots.txt data is unavailable for this scan.")).toBeInTheDocument();
  });

  it("renders DNSSEC without crashing when record arrays are missing", () => {
    render(
      <DnssecDetail
        data={
          {
            enabled: false,
            valid: false,
            algorithm: "",
            keyTag: 0,
          } as never
        }
      />
    );

    expect(screen.getAllByText(/No (DS|DNSKEY) records found/).length).toBe(2);
  });

  it("renders threats summary when entries array is missing", () => {
    render(
      <ThreatsDetail
        data={
          {
            listedCount: 0,
          } as never
        }
      />
    );

    expect(screen.getByText("No sources available")).toBeInTheDocument();
    expect(screen.getByText("No threat intelligence sources were checked.")).toBeInTheDocument();
  });

  it("renders archives without crashing when snapshots and dates are missing", () => {
    render(
      <ArchivesDetail
        data={
          {
            totalSnapshots: 0,
          } as never
        }
      />
    );

    expect(screen.getByText("No snapshots returned.")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders archives span fallback when snapshot dates are invalid", () => {
    render(
      <ArchivesDetail
        data={{
          totalSnapshots: 1,
          oldestSnapshot: "not-a-date",
          newestSnapshot: "still-not-a-date",
          snapshots: [],
        }}
      />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders sitemap when sampleUrls is missing", () => {
    render(
      <SitemapDetail
        data={
          {
            exists: false,
            url: "",
            urlCount: 0,
          } as never
        }
      />
    );

    expect(screen.getByText("No sample URLs available.")).toBeInTheDocument();
  });

  it("renders linked pages when internal/external are missing", () => {
    render(
      <LinkedPagesDetail
        data={
          {
            totalInternal: 0,
            totalExternal: 0,
          } as never
        }
      />
    );

    expect(screen.getAllByText("No links found.").length).toBe(2);
  });

  it("renders DNS tabs when record arrays are missing", () => {
    render(
      <DnsDetail
        data={
          {
            domain: "example.com",
          } as never
        }
      />
    );

    expect(screen.getByText("No records found.")).toBeInTheDocument();
  });

  it("groups features with missing category under Other", () => {
    render(
      <FeaturesDetail
        data={{
          features: [{ name: "Widget", detected: true, category: undefined as unknown as string }],
        }}
      />
    );

    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
  });

  it("renders cookie SameSite fallback when missing", () => {
    render(
      <CookiesDetail
        data={{
          cookies: [
            {
              name: "sid",
              domain: ".x.com",
              path: "/",
              secure: true,
              httpOnly: true,
              sameSite: undefined as unknown as "none",
              expires: "Session",
            },
          ],
          issuesCount: 0,
        }}
      />
    );

    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("renders status detail fallback values when all fields are missing", () => {
    render(
      <StatusDetail
        data={{
          httpStatusCode: null,
          responseTimeMs: null,
          serverHeader: null,
          contentType: null,
          redirectCount: null,
        }}
      />
    );

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("renders email config when mxRecords is not an array", () => {
    render(
      <EmailConfigDetail
        data={
          {
            mxRecords: "oops" as unknown as [],
            spf: { raw: "v=spf1", status: "pass" },
            dkim: { found: false },
            dmarc: { raw: "", policy: "none", status: "fail" },
          } as never
        }
      />
    );

    expect(screen.getByText("MX Records")).toBeInTheDocument();
  });

  it("renders firewall confidence fallback when malformed", () => {
    render(
      <FirewallDetail
        data={
          {
            detected: false,
            provider: null,
            confidence: undefined as unknown as number,
            evidence: "",
          } as never
        }
      />
    );

    const confidenceLabel = screen.getByText("Confidence");
    expect(confidenceLabel.nextElementSibling).toHaveTextContent("—");
  });

  it("renders whois fallback values for empty string fields", () => {
    render(
      <WhoisDetail
        data={{
          registrar: "",
          createdAt: "",
          updatedAt: "",
          expiresAt: "",
          nameservers: [],
          domainStatus: [],
        }}
      />
    );

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("renders quality gauge with zero when displayScore is missing", () => {
    render(
      <QualityDetail
        data={{
          categories: [
            {
              id: "perf",
              title: "Performance",
              score: null,
              displayScore: undefined as unknown as number,
            },
          ],
          audits: [],
          fetchTime: null,
          requestedUrl: "https://a.test",
          finalUrl: "https://a.test",
          runtimeError: null,
        }}
      />
    );

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
