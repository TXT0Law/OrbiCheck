import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ScanLayout from "@/app/dashboard/scan/[scanId]/layout";
import ScanSummaryPage from "@/app/dashboard/scan/[scanId]/page";
import type { ScanDetailContextValue } from "@/components/scan/scan-detail-context";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

const useScanDetailContextMock = vi.hoisted(() => vi.fn());
const useScanDetailMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn(() => ({ scanId: "scan-1" })));
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/dashboard/scan/scan-1/ssl"));
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: useParamsMock,
  usePathname: usePathnameMock,
  notFound: notFoundMock,
}));

vi.mock("@/lib/hooks/use-scan-detail", () => ({
  useScanDetail: (...args: unknown[]) => useScanDetailMock(...args),
}));

vi.mock("@/components/scan/scan-detail-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/scan/scan-detail-context")>();
  return {
    ...actual,
    useScanDetailContext: () => useScanDetailContextMock(),
  };
});

vi.mock("@/lib/hooks/use-scan-progress", () => ({
  useScanProgress: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/scan/details/section-skeleton", () => ({
  SectionSkeleton: () => <div data-testid="section-skeleton">loading</div>,
}));

vi.mock("@/components/scan/module-retry-banner", () => ({
  ModuleRetryBanner: ({ segment }: { segment: string }) => (
    <div data-testid="module-retry-banner">retry-{segment}</div>
  ),
}));

vi.mock("@/components/scan/details/archives-detail", () => ({ ArchivesDetail: () => <div data-testid="mock-detail">archives</div> }));
vi.mock("@/components/scan/details/associated-hosts-detail", () => ({
  AssociatedHostsDetail: () => <div data-testid="mock-detail">associated hosts</div>,
}));
vi.mock("@/components/scan/details/cookies-detail", () => ({ CookiesDetail: () => <div data-testid="mock-detail">cookies</div> }));
vi.mock("@/components/scan/details/dns-detail", () => ({ DnsDetail: () => <div data-testid="mock-detail">dns</div> }));
vi.mock("@/components/scan/details/dnssec-detail", () => ({ DnssecDetail: () => <div data-testid="mock-detail">dnssec</div> }));
vi.mock("@/components/scan/details/email-config-detail", () => ({ EmailConfigDetail: () => <div data-testid="mock-detail">email</div> }));
vi.mock("@/components/scan/details/features-detail", () => ({ FeaturesDetail: () => <div data-testid="mock-detail">features</div> }));
vi.mock("@/components/scan/details/firewall-detail", () => ({ FirewallDetail: () => <div data-testid="mock-detail">firewall</div> }));
vi.mock("@/components/scan/details/headers-detail", () => ({ HeadersDetail: () => <div data-testid="mock-detail">headers</div> }));
vi.mock("@/components/scan/details/hsts-detail", () => ({ HstsDetail: () => <div data-testid="mock-detail">hsts</div> }));
vi.mock("@/components/scan/details/ip-detail", () => ({ IpDetail: () => <div data-testid="mock-detail">ip</div> }));
vi.mock("@/components/scan/details/linked-pages-detail", () => ({ LinkedPagesDetail: () => <div data-testid="mock-detail">linked pages</div> }));
vi.mock("@/components/scan/details/ports-detail", () => ({ PortsDetail: () => <div data-testid="mock-detail">ports</div> }));
vi.mock("@/components/scan/details/quality-detail", () => ({ QualityDetail: () => <div data-testid="mock-detail">quality</div> }));
vi.mock("@/components/scan/details/ranking-detail", () => ({ RankingDetail: () => <div data-testid="mock-detail">ranking</div> }));
vi.mock("@/components/scan/details/redirects-detail", () => ({ RedirectsDetail: () => <div data-testid="mock-detail">redirects</div> }));
vi.mock("@/components/scan/details/robots-txt-detail", () => ({ RobotsTxtDetail: () => <div data-testid="mock-detail">robots</div> }));
vi.mock("@/components/scan/details/screenshot-detail", () => ({ ScreenshotDetail: () => <div data-testid="mock-detail">screenshot</div> }));
vi.mock("@/components/scan/details/security-txt-detail", () => ({ SecurityTxtDetail: () => <div data-testid="mock-detail">security txt</div> }));
vi.mock("@/components/scan/details/sitemap-detail", () => ({ SitemapDetail: () => <div data-testid="mock-detail">sitemap</div> }));
vi.mock("@/components/scan/details/social-tags-detail", () => ({ SocialTagsDetail: () => <div data-testid="mock-detail">social tags</div> }));
vi.mock("@/components/scan/details/ssl-detail", () => ({ SslDetail: () => <div data-testid="mock-detail">ssl</div> }));
vi.mock("@/components/scan/details/status-detail", () => ({ StatusDetail: () => <div data-testid="mock-detail">status</div> }));
vi.mock("@/components/scan/details/tech-stack-detail", () => ({ TechStackDetail: () => <div data-testid="mock-detail">tech</div> }));
vi.mock("@/components/scan/details/threats-detail", () => ({ ThreatsDetail: () => <div data-testid="mock-detail">threats</div> }));
vi.mock("@/components/scan/details/tls-detail", () => ({ TlsDetail: () => <div data-testid="mock-detail">tls</div> }));
vi.mock("@/components/scan/details/traceroute-detail", () => ({ TracerouteDetail: () => <div data-testid="mock-detail">traceroute</div> }));
vi.mock("@/components/scan/details/whois-detail", () => ({ WhoisDetail: () => <div data-testid="mock-detail">whois</div> }));

const subPageImports = [
  "@/app/dashboard/scan/[scanId]/archives/page",
  "@/app/dashboard/scan/[scanId]/associated-hosts/page",
  "@/app/dashboard/scan/[scanId]/cookies/page",
  "@/app/dashboard/scan/[scanId]/dns/page",
  "@/app/dashboard/scan/[scanId]/dnssec/page",
  "@/app/dashboard/scan/[scanId]/email-config/page",
  "@/app/dashboard/scan/[scanId]/features/page",
  "@/app/dashboard/scan/[scanId]/firewall/page",
  "@/app/dashboard/scan/[scanId]/headers/page",
  "@/app/dashboard/scan/[scanId]/hsts/page",
  "@/app/dashboard/scan/[scanId]/ip/page",
  "@/app/dashboard/scan/[scanId]/linked-pages/page",
  "@/app/dashboard/scan/[scanId]/ports/page",
  "@/app/dashboard/scan/[scanId]/quality/page",
  "@/app/dashboard/scan/[scanId]/ranking/page",
  "@/app/dashboard/scan/[scanId]/redirects/page",
  "@/app/dashboard/scan/[scanId]/robots-txt/page",
  "@/app/dashboard/scan/[scanId]/screenshot/page",
  "@/app/dashboard/scan/[scanId]/security-txt/page",
  "@/app/dashboard/scan/[scanId]/sitemap/page",
  "@/app/dashboard/scan/[scanId]/social-tags/page",
  "@/app/dashboard/scan/[scanId]/ssl/page",
  "@/app/dashboard/scan/[scanId]/status/page",
  "@/app/dashboard/scan/[scanId]/tech-stack/page",
  "@/app/dashboard/scan/[scanId]/threats/page",
  "@/app/dashboard/scan/[scanId]/tls/page",
  "@/app/dashboard/scan/[scanId]/traceroute/page",
  "@/app/dashboard/scan/[scanId]/whois/page",
] as const;

function scanLayoutWrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function baseScanDetailContext(overrides: Partial<ScanDetailContextValue> = {}): ScanDetailContextValue {
  return {
    scanId: "scan-1",
    detail: MOCK_SCAN_DETAIL,
    isLoading: false,
    isError: false,
    error: null,
    isNotFound: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function queryState(overrides: Record<string, unknown> = {}) {
  return {
    data: MOCK_SCAN_DETAIL,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("scan detail routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScanDetailContextMock.mockReturnValue(baseScanDetailContext());
    useScanDetailMock.mockReturnValue(queryState());
  });

  it("renders scan summary with key sections", () => {
    render(<ScanSummaryPage />);

    expect(screen.getByText("Scan Info")).toBeInTheDocument();
    expect(screen.getByText("Security Score")).toBeInTheDocument();
    expect(screen.getByText("Key Findings")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("shows empty category and key-finding copy when running and arrays are empty", () => {
    useScanDetailContextMock.mockReturnValue(
      baseScanDetailContext({
        detail: {
          ...MOCK_SCAN_DETAIL,
          status: "running",
          categorySummary: [],
          keyFindings: [],
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
          securityScore: null,
        },
      })
    );
    render(<ScanSummaryPage />);

    expect(screen.getByText(/Category summary will appear as modules finish/i)).toBeInTheDocument();
    expect(screen.getByText(/No key findings yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Severity counts update when the scan completes/i)).toBeInTheDocument();
  });

  it("shows empty category and key-finding copy when completed with no grouped data", () => {
    useScanDetailContextMock.mockReturnValue(
      baseScanDetailContext({
        detail: {
          ...MOCK_SCAN_DETAIL,
          status: "completed",
          categorySummary: [],
          keyFindings: [],
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
          securityScore: 0,
        },
      })
    );
    render(<ScanSummaryPage />);

    expect(
      screen.getByText(/No category summary for this scan/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/No key findings — no high-priority issues/i)).toBeInTheDocument();
    expect(screen.getByText(/All severity counts are zero/i)).toBeInTheDocument();
  });

  it("shows em dash when security score is null while scan is running", () => {
    useScanDetailContextMock.mockReturnValue(
      baseScanDetailContext({
        detail: { ...MOCK_SCAN_DETAIL, securityScore: null, status: "running" },
      })
    );
    render(<ScanSummaryPage />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/Available when the scan finishes/)).toBeInTheDocument();
  });

  it("renders keyFindings with id for stable React keys", () => {
    render(<ScanSummaryPage />);

    expect(screen.getByText("Missing CSP header")).toBeInTheDocument();
    expect(screen.getByText("Certificate expires soon")).toBeInTheDocument();
  });

  it("summary does not show ambiguous Scan data not found when detail is present", () => {
    useScanDetailContextMock.mockReturnValue(baseScanDetailContext());
    render(<ScanSummaryPage />);
    expect(screen.queryByText("Scan data not found.")).not.toBeInTheDocument();
    expect(screen.getByText("Scan Info")).toBeInTheDocument();
  });

  it.each(subPageImports)("renders implemented sub page %s", async (importPath) => {
    const mod = await import(importPath);

    render(React.createElement(mod.default));

    expect(screen.getByTestId("mock-detail")).toBeInTheDocument();
    expect(screen.queryByText("Scan data not found.")).not.toBeInTheDocument();
  });

  it("dns page shows module-specific empty state when dns is null", async () => {
    useScanDetailContextMock.mockReturnValue(
      baseScanDetailContext({
        detail: { ...MOCK_SCAN_DETAIL, dns: null as unknown as (typeof MOCK_SCAN_DETAIL)["dns"] },
      })
    );
    const mod = await import("@/app/dashboard/scan/[scanId]/dns/page");
    render(React.createElement(mod.default));
    expect(screen.getByText(/DNS data unavailable for this scan/i)).toBeInTheDocument();
  });

  it("quality page shows section skeleton when scan is running and quality slice missing", async () => {
    useScanDetailContextMock.mockReturnValue(
      baseScanDetailContext({
        detail: { ...MOCK_SCAN_DETAIL, status: "running", quality: null },
      })
    );
    const mod = await import("@/app/dashboard/scan/[scanId]/quality/page");
    render(React.createElement(mod.default));
    expect(screen.getByTestId("section-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-detail")).not.toBeInTheDocument();
  });

  it("associated-hosts page shows section skeleton when scan is running and data is pending", async () => {
    useScanDetailContextMock.mockReturnValue(
      baseScanDetailContext({
        detail: { ...MOCK_SCAN_DETAIL, status: "running", associatedHosts: null },
      })
    );
    const mod = await import("@/app/dashboard/scan/[scanId]/associated-hosts/page");
    render(React.createElement(mod.default));
    expect(screen.getByTestId("section-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-detail")).not.toBeInTheDocument();
  });

  it("scan layout handles loading, notFound and generic error", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;

    useScanDetailMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: true,
      refetch: vi.fn(),
    });
    const { rerender } = render(
      wrap(
        <ScanLayout>
          <div>child</div>
        </ScanLayout>
      )
    );
    expect(screen.getByText("Loading scan details...")).toBeInTheDocument();
    expect(screen.getByText("Loading scan details...").closest("[aria-busy='true']")).toBeTruthy();

    useScanDetailMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("scan not found"),
      isFetching: false,
      refetch: vi.fn(),
    });
    rerender(
      wrap(
        <ScanLayout>
          <div>child</div>
        </ScanLayout>
      )
    );
    expect(notFoundMock).toHaveBeenCalled();

    useScanDetailMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("network failed"),
      isFetching: false,
      refetch: vi.fn(),
    });
    rerender(
      wrap(
        <ScanLayout>
          <div>child</div>
        </ScanLayout>
      )
    );
    expect(screen.getByText("Failed to load scan detail: network failed")).toBeInTheDocument();
  });

  it("scan layout renders header, nav and child content", () => {
    usePathnameMock.mockReturnValue("/dashboard/scan/scan-1/ssl");
    useScanDetailMock.mockReturnValueOnce(queryState());

    render(
      scanLayoutWrapper(
        <ScanLayout>
          <div>detail-child</div>
        </ScanLayout>
      )
    );

    expect(screen.getByText("detail-child")).toBeInTheDocument();
    expect(screen.getByText("Back to Scans")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SSL Certificate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export summary \(json\)/i })).toBeInTheDocument();
    expect(screen.getByTestId("module-retry-banner")).toHaveTextContent("retry-ssl");
  });

  it("scan layout does not render module retry banner on summary page", () => {
    usePathnameMock.mockReturnValue("/dashboard/scan/scan-1");
    useScanDetailMock.mockReturnValueOnce(queryState());

    render(
      scanLayoutWrapper(
        <ScanLayout>
          <div>detail-child</div>
        </ScanLayout>
      )
    );

    expect(screen.queryByTestId("module-retry-banner")).not.toBeInTheDocument();
  });
});
