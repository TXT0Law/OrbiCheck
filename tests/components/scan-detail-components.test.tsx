import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { ArchivesDetail } from "@/components/scan/details/archives-detail";
import { AssociatedHostsDetail } from "@/components/scan/details/associated-hosts-detail";
import { CookiesDetail } from "@/components/scan/details/cookies-detail";
import { DnsDetail } from "@/components/scan/details/dns-detail";
import { DnssecDetail } from "@/components/scan/details/dnssec-detail";
import { EmailConfigDetail } from "@/components/scan/details/email-config-detail";
import { FeaturesDetail } from "@/components/scan/details/features-detail";
import { FirewallDetail } from "@/components/scan/details/firewall-detail";
import { HeadersDetail } from "@/components/scan/details/headers-detail";
import { HstsDetail } from "@/components/scan/details/hsts-detail";
import { IpDetail } from "@/components/scan/details/ip-detail";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import { LinkedPagesDetail } from "@/components/scan/details/linked-pages-detail";
import { PortsDetail } from "@/components/scan/details/ports-detail";
import { RankingDetail } from "@/components/scan/details/ranking-detail";
import { RedirectsDetail } from "@/components/scan/details/redirects-detail";
import { RobotsTxtDetail } from "@/components/scan/details/robots-txt-detail";
import { ScreenshotDetail } from "@/components/scan/details/screenshot-detail";
import { SectionSkeleton } from "@/components/scan/details/section-skeleton";
import { SecurityTxtDetail } from "@/components/scan/details/security-txt-detail";
import { SitemapDetail } from "@/components/scan/details/sitemap-detail";
import { SocialTagsDetail } from "@/components/scan/details/social-tags-detail";
import { SslDetail } from "@/components/scan/details/ssl-detail";
import { StatusDetail } from "@/components/scan/details/status-detail";
import { TechStackDetail } from "@/components/scan/details/tech-stack-detail";
import { ThreatsDetail } from "@/components/scan/details/threats-detail";
import { TlsDetail } from "@/components/scan/details/tls-detail";
import { TracerouteDetail } from "@/components/scan/details/traceroute-detail";
import { WhoisDetail } from "@/components/scan/details/whois-detail";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

describe("scan detail components", () => {
  it("renders all detail cards with mock payloads", () => {
    const components = [
      <SslDetail key="ssl" data={MOCK_SCAN_DETAIL.ssl} />,
      <HeadersDetail key="headers" data={MOCK_SCAN_DETAIL.headers} />,
      <IpDetail key="ip" data={MOCK_SCAN_DETAIL.ip} />,
      <WhoisDetail key="whois" data={MOCK_SCAN_DETAIL.whois} />,
      <DnsDetail key="dns" data={MOCK_SCAN_DETAIL.dns} />,
      <PortsDetail key="ports" data={MOCK_SCAN_DETAIL.ports} />,
      <StatusDetail key="status" data={MOCK_SCAN_DETAIL.statusCheck} />,
      <ScreenshotDetail key="screenshot" data={MOCK_SCAN_DETAIL.screenshot} />,
      <TechStackDetail key="tech" data={MOCK_SCAN_DETAIL.techStack} />,
      <TlsDetail key="tls" data={MOCK_SCAN_DETAIL.tls} />,
      <HstsDetail key="hsts" data={MOCK_SCAN_DETAIL.hsts} />,
      <CookiesDetail key="cookies" data={MOCK_SCAN_DETAIL.cookies} />,
      <FirewallDetail key="firewall" data={MOCK_SCAN_DETAIL.firewall} />,
      <ThreatsDetail key="threats" data={MOCK_SCAN_DETAIL.threats} />,
      <RedirectsDetail key="redirects" data={MOCK_SCAN_DETAIL.redirects} />,
      <EmailConfigDetail key="email" data={MOCK_SCAN_DETAIL.emailConfig} />,
      <FeaturesDetail key="features" data={MOCK_SCAN_DETAIL.features} />,
      <RobotsTxtDetail key="robots" data={MOCK_SCAN_DETAIL.robotsTxt} />,
      <SitemapDetail key="sitemap" data={MOCK_SCAN_DETAIL.sitemap} />,
      <DnssecDetail key="dnssec" data={MOCK_SCAN_DETAIL.dnssec} />,
      <SecurityTxtDetail key="securityTxt" data={MOCK_SCAN_DETAIL.securityTxt} />,
      <TracerouteDetail key="traceroute" data={MOCK_SCAN_DETAIL.traceroute} />,
      <AssociatedHostsDetail key="hosts" data={MOCK_SCAN_DETAIL.associatedHosts!} />,
      <LinkedPagesDetail key="linked" data={MOCK_SCAN_DETAIL.linkedPages} />,
      <SocialTagsDetail key="social" data={MOCK_SCAN_DETAIL.socialTags} />,
      <ArchivesDetail key="archives" data={MOCK_SCAN_DETAIL.archives} />,
      <RankingDetail key="ranking" data={MOCK_SCAN_DETAIL.rankingAndCarbon} />,
    ];

    for (const element of components) {
      const { container, unmount } = render(element);
      expect(container.firstChild).toBeTruthy();
      unmount();
    }
  });

  it("renders utility detail components", () => {
    const { container: skeletonContainer } = render(<SectionSkeleton />);
    expect(skeletonContainer.firstChild).toBeTruthy();

    const { container: keyValueContainer } = render(
      <KeyValueCard
        title="Key Values"
        items={[
          { label: "One", value: "1" },
          { label: "Two", value: "2" },
        ]}
      />
    );
    expect(keyValueContainer.firstChild).toBeTruthy();
  });

  it("handles nullable detail fallbacks", () => {
    const nullableComponents = [
      <SslDetail key="ssl-null" data={null} />,
      <WhoisDetail key="whois-null" data={null} />,
      <PortsDetail key="ports-null" data={null} />,
      <ScreenshotDetail key="shot-null" data={null} />,
      <TechStackDetail key="tech-null" data={null} />,
      <RedirectsDetail key="redirects-null" data={null} />,
      <FeaturesDetail key="features-null" data={null} />,
      <TracerouteDetail key="traceroute-null" data={null} />,
    ];

    for (const element of nullableComponents) {
      const { container, unmount } = render(element);
      expect(container.firstChild).toBeTruthy();
      unmount();
    }
  });
});
