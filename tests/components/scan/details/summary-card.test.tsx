import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { SummaryCard } from "@/components/scan/details/summary-card";

describe("SummaryCard", () => {
  it("renders title, icon, status, and summary lines", () => {
    render(
      <SummaryCard
        title="Protocol Support"
        icon="🔒"
        status="pass"
        summaryLines={["Supported: TLS 1.3, TLS 1.2", "Deprecated Disabled: TLS 1.1"]}
        detailLink="../tls"
        detailLinkText="View Full Details"
      />
    );

    expect(screen.getByText(/Protocol Support/)).toBeInTheDocument();
    expect(screen.getByText(/Supported: TLS 1\.3/)).toBeInTheDocument();
    expect(screen.getByText(/View Full Details/)).toBeInTheDocument();
  });

  it("renders detail link with correct href", () => {
    render(
      <SummaryCard
        title="Test"
        icon="🔒"
        status="info"
        summaryLines={["Line 1"]}
        detailLink="../tls"
        detailLinkText="Go to TLS"
      />
    );

    const link = screen.getByRole("link", { name: /Go to TLS/ });
    expect(link).toHaveAttribute("href", "../tls");
  });
});
