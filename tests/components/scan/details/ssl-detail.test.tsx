import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { formatDate, SslDetail } from "@/components/scan/details/ssl-detail";
import type { SslCheckResult } from "@/shared/types/scan";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

const FULL_DATA: SslCheckResult = {
  grade: "A+",
  issuer: "DigiCert SHA2 Extended Validation Server CA",
  subject: "github.com",
  validFrom: "2024-03-07T00:00:00.000Z",
  validTo: "2025-03-12T23:59:59.000Z",
  daysRemaining: 180,
  chainDepth: 3,
  keySize: 2048,
  signatureAlgorithm: "sha256WithRSAEncryption",
  sans: ["github.com", "www.github.com"],
  chain: ["github.com", "DigiCert SHA2 EV CA", "DigiCert Global Root CA"],
  chainComplete: true,
  chainOrderValid: true,
  chainDetails: [
    { subject: "github.com", issuer: "DigiCert SHA2 EV CA", order: 0, isTrusted: true },
    { subject: "DigiCert SHA2 EV CA", issuer: "DigiCert Global Root CA", order: 1, isTrusted: true },
  ],
  protocols: [
    { name: "TLSv1.3", supported: true, secure: "good" },
    { name: "TLSv1.2", supported: true, secure: "good" },
    { name: "TLSv1.1", supported: false, secure: "warning" },
  ],
  cipherSuites: [
    { name: "TLS_AES_256_GCM_SHA384", protocol: "TLSv1.3", strength: "strong" },
    { name: "TLS_CHACHA20_POLY1305_SHA256", protocol: "TLSv1.3", strength: "strong" },
  ],
  forwardSecrecy: true,
  vulnerabilities: [
    { id: "CVE-2014-0160", name: "Heartbleed", status: "not-vulnerable" },
    { id: "CVE-2014-3566", name: "POODLE", status: "not-vulnerable" },
  ],
  certType: "EV",
  hsts: { enabled: true, maxAge: 31536000, preload: true, includeSubDomains: true },
  cnMatchesSan: true,
  wildcardScope: null,
  ct: { hasSct: true, logCount: 3 },
  caa: ['0 issue "digicert.com"'],
  secureRenegotiation: true,
  tlsCompression: false,
};

const MINIMAL_DATA: SslCheckResult = {
  grade: "B",
  issuer: "Unknown",
  subject: "example.com",
  validFrom: "",
  validTo: "",
  daysRemaining: 0,
  chainDepth: 0,
  keySize: 0,
  signatureAlgorithm: "Unknown",
  sans: [],
  chain: [],
};

describe("SslDetail", () => {
  it("renders overview section with grade", () => {
    render(<SslDetail data={FULL_DATA} />);
    expect(screen.getByText("A+")).toBeInTheDocument();
    expect(screen.getAllByText("github.com").length).toBeGreaterThan(0);
  });

  it("renders certificate chain table when chainDetails present", () => {
    render(<SslDetail data={FULL_DATA} />);
    expect(screen.getByText("Certificate Chain")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("renders SAN list", () => {
    render(<SslDetail data={FULL_DATA} />);
    expect(screen.getByText("www.github.com")).toBeInTheDocument();
  });

  it("renders protocol summary card with link to TLS", () => {
    render(<SslDetail data={FULL_DATA} />);
    // Summary card shows "Supported: TLSv1.3, TLSv1.2" and "View Full Details" link
    expect(screen.getByText(/Supported: TLSv1\.3/)).toBeInTheDocument();
    expect(screen.getAllByText(/View Full Details/).length).toBeGreaterThan(0);
  });

  it("renders cipher suites summary card with link to TLS", () => {
    render(<SslDetail data={FULL_DATA} />);
    expect(screen.getByText(/Cipher Suites/)).toBeInTheDocument();
    expect(screen.getByText(/Total: 2 suites/)).toBeInTheDocument();
    expect(screen.getByText(/Forward Secrecy/)).toBeInTheDocument();
  });

  it("renders vulnerabilities", () => {
    render(<SslDetail data={FULL_DATA} />);
    expect(screen.getByText("Heartbleed")).toBeInTheDocument();
    expect(screen.getByText("Known Vulnerabilities")).toBeInTheDocument();
  });

  it("renders HSTS summary card with link to HSTS page", () => {
    render(<SslDetail data={FULL_DATA} />);
    expect(screen.getByText(/HSTS/)).toBeInTheDocument();
    expect(screen.getByText(/Enabled with Preload/)).toBeInTheDocument();
    expect(screen.getByText(/includeSubDomains: on/)).toBeInTheDocument();
  });

  it("handles minimal data without crashing", () => {
    render(<SslDetail data={MINIMAL_DATA} />);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText(/Protocol data not available/)).toBeInTheDocument();
    expect(screen.getByText(/Cipher data not available/)).toBeInTheDocument();
    expect(
      screen.getByText(/TLS scan returned no vulnerability checklist rows/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No CAA records were attached/i)).toBeInTheDocument();
  });

  it("formatDate returns N/A for empty, whitespace, or invalid dates", () => {
    expect(formatDate("")).toBe("N/A");
    expect(formatDate("   ")).toBe("N/A");
    expect(formatDate(undefined)).toBe("N/A");
    expect(formatDate("not-a-real-date")).toBe("N/A");
  });

  it("does not render Invalid Date in overview for bogus validity strings", () => {
    render(
      <SslDetail
        data={{
          ...MINIMAL_DATA,
          validFrom: "not-a-date",
          validTo: "also-bad",
        }}
      />,
    );
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
    expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(2);
  });

  it("protocol summary shows Fail when no protocol is supported", () => {
    render(
      <SslDetail
        data={{
          ...FULL_DATA,
          protocols: [{ name: "TLSv1.1", supported: false, secure: "warning" }],
        }}
      />,
    );
    expect(screen.getByText(/Status: Fail/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No supported TLS protocols reported/i),
    ).toBeInTheDocument();
  });

  it("shows neutral grade badge for unknown or empty grade", () => {
    const data = { ...MINIMAL_DATA, grade: "Q" as (typeof MINIMAL_DATA)["grade"] };
    render(<SslDetail data={data} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("handles null data", () => {
    render(<SslDetail data={null} />);
    expect(screen.getByText("SSL module data is unavailable for this scan.")).toBeInTheDocument();
  });

  it("works with mock scan detail (backward compat)", () => {
    render(<SslDetail data={MOCK_SCAN_DETAIL.ssl} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getAllByText(/example\.com/).length).toBeGreaterThan(0);
  });
});
