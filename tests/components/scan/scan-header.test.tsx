import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { ScanHeader } from "@/components/scan/scan-header";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard/scan/scan-1"),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/report/report-generate-dialog", () => ({
  ReportGenerateDialog: ({
    open,
  }: {
    open: boolean;
  }) => (open ? <div>Report Dialog Open</div> : null),
}));

vi.mock("@/lib/utils/export-json", () => ({
  downloadJson: vi.fn(),
  pickScanDetailExportSummary: vi.fn(() => ({ ok: true })),
}));

describe("scan header", () => {
  it("opens the generate report dialog for completed scans", () => {
    render(
      <ScanHeader
        detail={
          {
            id: "scan-1",
            domain: "example.com",
            url: "https://example.com",
            status: "completed",
          } as never
        }
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));
    expect(screen.getByText("Report Dialog Open")).toBeInTheDocument();
  });

  it("disables report generation for non-completed scans", () => {
    render(
      <ScanHeader
        detail={
          {
            id: "scan-1",
            domain: "example.com",
            url: "https://example.com",
            status: "running",
          } as never
        }
      />
    );

    expect(screen.getByRole("button", { name: /generate report/i })).toBeDisabled();
  });
});
