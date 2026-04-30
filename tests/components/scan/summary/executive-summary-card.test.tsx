import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { ExecutiveSummaryCard } from "@/components/scan/summary/executive-summary-card";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";
import type { Recommendation, ScanDetail } from "@/shared/types/scan";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function buildDetail(overrides: Partial<ScanDetail>): ScanDetail {
  return { ...MOCK_SCAN_DETAIL, ...overrides };
}

const SAMPLE_RECOMMENDATIONS: Recommendation[] = [
  {
    severity: "critical",
    title: "Replace expired SSL certificate",
    description: "Renew immediately.",
    module: "ssl",
  },
  {
    severity: "medium",
    title: "Enable DNSSEC validation",
    description: "Sign the zone.",
    module: "dnssec",
  },
  {
    severity: "high",
    title: "Harden HTTP response headers",
    description: "Add CSP.",
    module: "headers",
  },
  {
    severity: "low",
    title: "Add security.txt",
    description: "Publish a contact policy.",
  },
];

describe("ExecutiveSummaryCard", () => {
  it("renders the strong-posture verdict for high scores", () => {
    render(<ExecutiveSummaryCard detail={buildDetail({ securityScore: 92 })} />);

    expect(screen.getByText(/Strong external posture/i)).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("renders the in-progress verdict and em-dash gauge while scan is running", () => {
    render(
      <ExecutiveSummaryCard
        detail={buildDetail({ status: "running", securityScore: null })}
      />,
    );

    expect(
      screen.getByText(/Scan in progress — verdict will appear once modules finish/i),
    ).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("sorts top actions by severity and links the ones with a module id", () => {
    render(
      <ExecutiveSummaryCard
        detail={buildDetail({ recommendations: SAMPLE_RECOMMENDATIONS })}
      />,
    );

    const titles = ["Replace expired SSL certificate", "Harden HTTP response headers", "Enable DNSSEC validation"];
    for (const title of titles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByText("Add security.txt")).not.toBeInTheDocument();

    const sslLink = screen.getByText("Replace expired SSL certificate").closest("a");
    expect(sslLink?.getAttribute("href")).toBe("/dashboard/scan/scan-001/ssl");
  });

  it("flags the card as urgent when the scan has critical or high findings", () => {
    render(
      <ExecutiveSummaryCard
        detail={buildDetail({
          severity: { critical: 1, high: 0, medium: 0, low: 0 },
        })}
      />,
    );

    const card = screen.getByTestId("executive-summary-card");
    expect(card).toHaveAttribute("data-urgent", "true");
  });

  it("renders a placeholder copy when no recommendations are available", () => {
    render(
      <ExecutiveSummaryCard
        detail={buildDetail({
          recommendations: [],
          securityScore: 75,
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
        })}
      />,
    );

    expect(screen.getByText(/No prioritised actions/i)).toBeInTheDocument();
  });
});
