import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { TlsDetail } from "@/components/scan/details/tls-detail";
import type { TlsResult } from "@/shared/types/scan";

const mockTlsData: TlsResult = {
  grade: "A+",
  score: 95,
  protocols: [
    { name: "TLSv1.3", supported: true, secure: "good" },
    { name: "TLSv1.2", supported: true, secure: "good" },
    { name: "TLSv1.1", supported: false, secure: "warning" },
    { name: "SSLv3", supported: false, secure: "danger" },
  ],
  cipherSuites: [
    {
      name: "TLS_AES_256_GCM_SHA384",
      protocol: "TLSv1.3",
      strength: "strong",
      keyExchange: "ECDHE",
      auth: "RSA",
      encryption: "AES-256-GCM",
      mac: "SHA384",
      forwardSecrecy: true,
    },
  ],
  cipherStats: {
    total: 1,
    weakCount: 0,
    forwardSecrecyPercent: 100,
    aeadPercent: 100,
  },
  preferredProtocol: "TLSv1.3",
  sessionResumption: true,
};

describe("TlsDetail", () => {
  it("renders grade card with correct grade", () => {
    render(<TlsDetail data={mockTlsData} />);
    expect(screen.getByText("A+")).toBeInTheDocument();
  });

  it("renders protocol table with all protocols", () => {
    render(<TlsDetail data={mockTlsData} />);
    expect(screen.getByText("Protocol Support")).toBeInTheDocument();
    expect(screen.getByText("TLSv1.2")).toBeInTheDocument();
  });

  it("renders cipher stats correctly", () => {
    render(<TlsDetail data={mockTlsData} />);
    expect(screen.getByText("Cipher Suite Statistics")).toBeInTheDocument();
    expect(screen.getByText("Total Ciphers")).toBeInTheDocument();
  });

  it("renders cipher table with details", () => {
    render(<TlsDetail data={mockTlsData} />);
    expect(screen.getByText("TLS_AES_256_GCM_SHA384")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = render(<TlsDetail data={null} isLoading />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows empty state when data is null", () => {
    render(<TlsDetail data={null} />);
    expect(screen.getByText(/no tls data/i)).toBeInTheDocument();
  });

  it("renders strength badge", () => {
    render(<TlsDetail data={mockTlsData} />);
    expect(screen.getByText("strong")).toBeInTheDocument();
  });

  it("does not render curves section when empty", () => {
    const dataWithoutCurves = { ...mockTlsData, curves: undefined };
    render(<TlsDetail data={dataWithoutCurves} />);
    expect(screen.queryByText("Elliptic Curves")).not.toBeInTheDocument();
  });

  it("renders curves section when present", () => {
    const dataWithCurves = {
      ...mockTlsData,
      curves: ["prime256v1", "secp384r1"],
    };
    render(<TlsDetail data={dataWithCurves} />);
    expect(screen.getByText("Elliptic Curves")).toBeInTheDocument();
    expect(screen.getByText("prime256v1")).toBeInTheDocument();
  });

  it("shows empty when protocols and cipherSuites are empty", () => {
    render(
      <TlsDetail
        data={{
          protocols: [],
          cipherSuites: [],
          preferredProtocol: "",
          sessionResumption: false,
        }}
      />
    );
    expect(screen.getByText(/no tls data/i)).toBeInTheDocument();
  });
});
