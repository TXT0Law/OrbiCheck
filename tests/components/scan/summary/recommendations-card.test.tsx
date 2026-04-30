import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { RecommendationsCard } from "@/components/scan/summary/recommendations-card";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

describe("RecommendationsCard", () => {
  it("renders rows with deep links when a module id is present", () => {
    render(
      <RecommendationsCard
        detail={{
          ...MOCK_SCAN_DETAIL,
          recommendations: [
            {
              severity: "high",
              title: "Renew SSL certificate soon",
              description: "Within 30 days.",
              module: "ssl",
            },
            {
              severity: "medium",
              title: "Enable DNSSEC validation",
              description: "Sign the zone.",
            },
          ],
        }}
      />,
    );

    const sslLink = screen.getByText("Renew SSL certificate soon").closest("a");
    expect(sslLink?.getAttribute("href")).toBe("/dashboard/scan/scan-001/ssl");

    expect(screen.getByText("Enable DNSSEC validation").closest("a")).toBeNull();
    expect(screen.getAllByText("View module detail →")).toHaveLength(1);
  });

  it("renders the running-state copy when recommendations are empty mid-scan", () => {
    render(
      <RecommendationsCard
        detail={{ ...MOCK_SCAN_DETAIL, status: "running", recommendations: [] }}
      />,
    );

    expect(
      screen.getByText(/Recommendations will appear as the scan completes/i),
    ).toBeInTheDocument();
  });

  it("renders the terminal-state copy when no recommendations were produced", () => {
    render(
      <RecommendationsCard
        detail={{ ...MOCK_SCAN_DETAIL, status: "completed", recommendations: [] }}
      />,
    );

    expect(
      screen.getByText(/No actionable recommendations were produced/i),
    ).toBeInTheDocument();
  });
});
