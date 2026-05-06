import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ScanDiffView } from "@/components/scan/diff/scan-diff-view";
import type { ScanDiffResponse } from "@/shared/types/scan";

function buildDiff(overrides: Partial<ScanDiffResponse> = {}): ScanDiffResponse {
  return {
    baseScanId: "base-1",
    compareScanId: "compare-1",
    baseDomain: "example.com",
    compareDomain: "example.com",
    baseCompletedAt: "2026-04-01T00:00:00Z",
    compareCompletedAt: "2026-05-01T00:00:00Z",
    baseScore: 70,
    compareScore: 82,
    addedFindings: [
      {
        title: "SSL certificate expired",
        severity: "critical",
        module: "ssl",
        description: "The SSL certificate has expired.",
      },
    ],
    removedFindings: [],
    severityDelta: {
      base: { critical: 0, high: 1, medium: 2, low: 3 },
      compare: { critical: 1, high: 0, medium: 1, low: 2 },
      delta: { critical: 1, high: -1, medium: -1, low: -1 },
    },
    breakdownDelta: {
      base: {
        transport: 20,
        httpSecurity: 15,
        threatIntel: 10,
        infrastructure: 5,
        bestPractices: 5,
      },
      compare: {
        transport: 25,
        httpSecurity: 18,
        threatIntel: 12,
        infrastructure: 8,
        bestPractices: 6,
      },
      delta: {
        transport: 5,
        httpSecurity: 3,
        threatIntel: 2,
        infrastructure: 3,
        bestPractices: 1,
      },
    },
    ...overrides,
  };
}

describe("ScanDiffView", () => {
  it("renders summary, severity table, breakdown table, and diff sections", () => {
    render(<ScanDiffView diff={buildDiff()} />);

    expect(screen.getByText(/Scan diff summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Severity delta/i)).toBeInTheDocument();
    expect(screen.getByText(/Category score delta/i)).toBeInTheDocument();
    expect(screen.getByText(/New in compare \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Resolved in compare \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText("SSL certificate expired")).toBeInTheDocument();
  });

  it("shows the unchanged hint when there is no delta and no findings", () => {
    render(
      <ScanDiffView
        diff={buildDiff({
          addedFindings: [],
          removedFindings: [],
          severityDelta: {
            base: { critical: 0, high: 0, medium: 0, low: 0 },
            compare: { critical: 0, high: 0, medium: 0, low: 0 },
            delta: { critical: 0, high: 0, medium: 0, low: 0 },
          },
        })}
      />,
    );

    expect(screen.getByText(/Both scans report the same/i)).toBeInTheDocument();
  });

  it("falls back gracefully when breakdownDelta is null", () => {
    render(
      <ScanDiffView
        diff={buildDiff({
          breakdownDelta: { base: null, compare: null, delta: null },
        })}
      />,
    );

    expect(
      screen.getByText(/Breakdown unavailable/i),
    ).toBeInTheDocument();
  });

  it("links each scan id to its detail page", () => {
    render(<ScanDiffView diff={buildDiff()} />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/scan/base-1");
    expect(hrefs).toContain("/dashboard/scan/compare-1");
  });
});
