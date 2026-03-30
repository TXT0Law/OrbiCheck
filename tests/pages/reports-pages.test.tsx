import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import ReportDetailPage from "@/app/dashboard/reports/[reportId]/page";
import ReportsPage from "@/app/dashboard/reports/page";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/report/report-generate-dialog", () => ({
  ReportGenerateDialog: () => <div>Generate Report Dialog</div>,
}));

vi.mock("@/lib/hooks/use-reports", () => ({
  useReportList: vi.fn(() => ({
    isLoading: false,
    data: {
      reports: [
        {
          id: "report-1",
          title: "Security Report - example.com",
          format: "both",
          status: "completed",
          scanDomain: "example.com",
          fileSizeBytes: 4096,
          createdAt: "2026-03-27T00:00:00Z",
          completedAt: "2026-03-27T00:01:00Z",
        },
      ],
    },
  })),
  useDeleteReport: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useReport: vi.fn(() => ({
    isLoading: false,
    data: {
      id: "report-1",
      title: "Security Report - example.com",
      format: "both",
      status: "completed",
      scanId: "scan-1",
      monitorId: null,
      monitorPeriod: "30d",
      fileSizeBytes: 4096,
      errorMessage: null,
      createdAt: "2026-03-27T00:00:00Z",
      completedAt: "2026-03-27T00:01:00Z",
    },
  })),
  useReportPreview: vi.fn(() => ({
    data: {
      id: "report-1",
      title: "Security Report - example.com",
      status: "completed",
      contentMd: "# Heading\n\nReport body",
      reportMeta: null,
    },
  })),
}));

vi.mock("@/lib/api/reports", () => ({
  downloadReport: vi.fn(),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("reports pages", () => {
  it("renders the reports list", () => {
    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
    expect(screen.getByText("Generate Report Dialog")).toBeInTheDocument();
  });

  it("renders the report detail preview", () => {
    render(<ReportDetailPage params={{ reportId: "report-1" }} />);

    expect(screen.getByRole("heading", { name: "Security Report - example.com" })).toBeInTheDocument();
    expect(screen.getByText("Markdown Preview")).toBeInTheDocument();
    expect(screen.getByText("Heading")).toBeInTheDocument();
    expect(screen.getByText("Report body")).toBeInTheDocument();
  });
});
