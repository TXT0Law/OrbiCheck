import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReportDetailPage from "@/app/dashboard/reports/[reportId]/page";
import ReportsPage from "@/app/dashboard/reports/page";
import { APPEARANCE_KEYS } from "@/lib/mock-data";
import type { ReportSchedule } from "@/shared/types/report";

const schedulesMock = vi.hoisted(() => ({
  data: [] as ReportSchedule[],
}));

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

vi.mock("@/components/report/report-schedule-dialog", () => ({
  ReportScheduleDialog: () => <div>Report Schedule Dialog</div>,
}));

vi.mock("@/lib/hooks/use-report-schedules", () => ({
  useReportSchedules: vi.fn(() => ({
    isLoading: false,
    data: { schedules: schedulesMock.data },
  })),
  useUpdateReportSchedule: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteReportSchedule: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRunReportScheduleNow: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
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
          scanId: "scan-1",
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

vi.mock("@/lib/hooks/use-scan-trend", () => ({
  useScanDomainTimeline: () => ({ data: { domain: "", points: [] }, isLoading: false, error: null }),
  useScanDiff: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("reports pages", () => {
  beforeEach(() => {
    localStorage.clear();
    schedulesMock.data = [];
  });

  it("renders the reports list", () => {
    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
    expect(screen.getByText("Generate Report Dialog")).toBeInTheDocument();
    expect(screen.getByText("Report Schedule Dialog")).toBeInTheDocument();
  });

  it("renders the reports page chrome in Chinese", () => {
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");

    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "報告" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建立排程" })).toBeInTheDocument();
    expect(screen.getByText("排程")).toBeInTheDocument();
  });

  it("renders the schedule list controls in Chinese", () => {
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");
    schedulesMock.data = [
      {
        id: "schedule-1",
        userId: 1,
        name: "Weekly report",
        scanId: "scan-1",
        monitorId: null,
        monitorPeriod: null,
        format: "pdf",
        cadence: "weekly",
        timezone: "UTC",
        dayOfWeek: 0,
        dayOfMonth: null,
        hour: 9,
        minute: 0,
        deliveryChannels: [],
        emailRecipients: [],
        isEnabled: true,
        lastRunAt: null,
        nextRunAt: "2026-03-28T09:00:00Z",
        createdAt: "2026-03-27T00:00:00Z",
        updatedAt: "2026-03-27T00:00:00Z",
        recentRuns: [],
      },
    ];

    render(<ReportsPage />);
    fireEvent.click(screen.getByRole("button", { name: "排程" }));

    expect(screen.getByText("週期")).toBeInTheDocument();
    expect(screen.getByText("僅儲存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編輯" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即執行" })).toBeInTheDocument();
  });

  it("renders the report detail preview", () => {
    render(<ReportDetailPage params={{ reportId: "report-1" }} />);

    expect(screen.getByRole("heading", { name: "Security Report - example.com" })).toBeInTheDocument();
    expect(screen.getByText("Markdown Preview")).toBeInTheDocument();
    expect(screen.getByText("Heading")).toBeInTheDocument();
    expect(screen.getByText("Report body")).toBeInTheDocument();
  });
});
