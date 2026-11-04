import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScanDetailResponseSchema } from "@/shared/schemas/scan";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";
import { SslOverviewSection } from "@/components/scan/details/ssl/ssl-overview-section";
import { SslHstsSummaryCard } from "@/components/scan/details/ssl/ssl-hsts-extensions-caa-server";

describe("partial scan evidence", () => {
  it("preserves nullable SSL facts through response validation and rendering", () => {
    const ssl = { ...MOCK_SCAN_DETAIL.ssl!, grade: null, daysRemaining: null, hsts: null };
    const parsed = ScanDetailResponseSchema.parse({ ...MOCK_SCAN_DETAIL, ssl, hsts: null });
    expect(parsed.ssl).toEqual(ssl);
    render(<><SslOverviewSection data={ssl} /><SslHstsSummaryCard hsts={ssl.hsts} /></>);
    expect(screen.queryByText("C")).not.toBeInTheDocument();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Not enabled")).not.toBeInTheDocument();
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });

  it("rejects malformed SSL fact types", () => {
    expect(ScanDetailResponseSchema.safeParse({ ...MOCK_SCAN_DETAIL,
      ssl: { ...MOCK_SCAN_DETAIL.ssl, daysRemaining: "unknown" },
    }).success).toBe(false);
  });
});

it("accepts unknown category coverage without coercing it to pass", () => {
  const parsed = ScanDetailResponseSchema.parse({ ...MOCK_SCAN_DETAIL, categorySummary: [
    { category: "security", label: "Security", modulesChecked: 0, issuesFound: 0, status: "unknown" },
  ] });
  expect(parsed.categorySummary[0].status).toBe("unknown");
});
