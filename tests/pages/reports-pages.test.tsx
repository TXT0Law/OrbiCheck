import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReportDetailPage from "@/app/dashboard/reports/[reportId]/page";
import ReportsPage from "@/app/dashboard/reports/page";
import { APPEARANCE_KEYS } from "@/lib/mock-data";
import type { ReportSchedule } from "@/shared/types/report";

const schedulesMock = vi.hoisted(() => ({
  data: [] as ReportSchedule[],
  error: false,
  refetch: vi.fn(),
}));
const previewMock = vi.hoisted(() => ({ content: "# Heading\n\nReport body" }));
const reportsMock = vi.hoisted(() => ({ empty: false, error: false, refetch: vi.fn(), paginated: false, fetching: false, total: 25, removedLastPage: false }));

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
    isError: schedulesMock.error,
    refetch: schedulesMock.refetch,
    data: { schedules: schedulesMock.data },
  })),
  useUpdateReportSchedule: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteReportSchedule: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRunReportScheduleNow: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/lib/hooks/use-reports", () => ({
  useReportList: vi.fn((params?: { page?: number }) => ({
    isLoading: false,
    isFetching: reportsMock.fetching,
    isError: reportsMock.error,
    refetch: reportsMock.refetch,
    error: reportsMock.error ? new Error("Report API unavailable") : null,
    data: {
      meta: reportsMock.paginated ? { page: params?.page ?? 1, limit: 20, total: reportsMock.total } : undefined,
      reports: reportsMock.empty || (reportsMock.removedLastPage && params?.page === 2) ? [] : [
        {
          id: "report-1",
          title: reportsMock.paginated && params?.page === 2 ? "Older report" : "Security Report - example.com",
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
      contentMd: previewMock.content,
      reportMeta: null,
    },
  })),
}));

vi.mock("@/lib/hooks/use-operational-events", () => ({
  useReportOperationalEvents: vi.fn(() => ({
    data: { events: [] },
    isLoading: false,
    error: null,
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
    schedulesMock.error = false;
    previewMock.content = "# Heading\n\nReport body";
    reportsMock.empty = false;
    reportsMock.error = false;
    reportsMock.paginated = false;
    reportsMock.fetching = false;
    reportsMock.total = 25;
    reportsMock.removedLastPage = false;
    reportsMock.refetch.mockClear();
  });

  it("renders the reports list", () => {
    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
    expect(screen.getByText("Generate Report Dialog")).toBeInTheDocument();
    expect(screen.getByText("Report Schedule Dialog")).toBeInTheDocument();
  });

  it("shows a clear empty state when no report exists", () => {
    reportsMock.empty = true;

    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "No reports yet" })).toBeInTheDocument();
    expect(screen.getByText(/Create your first report from a completed scan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeInTheDocument();
    expect(screen.queryByText("Security Report - example.com")).not.toBeInTheDocument();
  });

  it("shows a persistent report error and allows retry without empty onboarding", () => {
    reportsMock.empty = true;
    reportsMock.error = true;
    render(<ReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Reports could not be loaded.");
    expect(screen.queryByRole("heading", { name: "No reports yet" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reportsMock.refetch).toHaveBeenCalled();
  });

  it("lets users reach older reports and return with clear page boundaries", () => {
    reportsMock.paginated = true;
    render(<ReportsPage />);
    expect(screen.getByRole("navigation", { name: "Report pages" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Older report")).toBeInTheDocument();
    expect(screen.queryByText("Security Report - example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
  });

  it("returns to the last valid page after the only report on page two is deleted", () => {
    reportsMock.paginated = true;
    reportsMock.total = 21;
    const { rerender } = render(<ReportsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Older report")).toBeInTheDocument();

    // The invalidated list returns the authoritative total after deletion.
    reportsMock.total = 20;
    reportsMock.removedLastPage = true;
    rerender(<ReportsPage />);
    expect(screen.queryByRole("heading", { name: "No reports yet" })).not.toBeInTheDocument();
    expect(screen.queryByText("Page 2 of 1")).not.toBeInTheDocument();
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("resets to the first page when the report collection becomes empty", () => {
    reportsMock.paginated = true;
    const { rerender } = render(<ReportsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    reportsMock.total = 0;
    reportsMock.empty = true;
    rerender(<ReportsPage />);
    expect(screen.getByRole("heading", { name: "No reports yet" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("preserves cached reports with a persistent warning when refresh fails", () => {
    reportsMock.error = true;
    render(<ReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Reports could not be loaded.");
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No reports yet" })).not.toBeInTheDocument();
  });

  it("prevents duplicate navigation while fetching and lets users leave or retry a failed page", () => {
    reportsMock.paginated = true;
    const { rerender } = render(<ReportsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    reportsMock.fetching = true;
    rerender(<ReportsPage />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    reportsMock.fetching = false;
    reportsMock.error = true;
    reportsMock.empty = true;
    rerender(<ReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Reports could not be loaded.");
    expect(screen.queryByRole("heading", { name: "No reports yet" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reportsMock.refetch).toHaveBeenCalled();
    reportsMock.error = false;
    reportsMock.empty = false;
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Security Report - example.com")).toBeInTheDocument();
  });

  it("renders the reports page chrome in Chinese", () => {
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");
    reportsMock.paginated = true;

    render(<ReportsPage />);

    expect(screen.getByRole("heading", { name: "報告" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建立排程" })).toBeInTheDocument();
    expect(screen.getByText("排程")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "報告分頁" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一頁" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一頁" })).toBeEnabled();
    expect(screen.getByText("第 1 頁，共 2 頁")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "執行歷史" })).toBeInTheDocument();
  });

  it("shows schedule query failure instead of an empty schedule collection", () => {
    schedulesMock.error = true;
    render(<ReportsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Schedules" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Schedules could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(schedulesMock.refetch).toHaveBeenCalled();
  });

  it("renders the report detail preview", async () => {
    render(<ReportDetailPage params={{ reportId: "report-1" }} />);

    expect(screen.getByRole("heading", { name: "Security Report - example.com" })).toBeInTheDocument();
    // Wait for the real lazy module (including its Markdown dependencies) to load.
    // A cold transform can take longer than findByText's default DOM wait.
    await act(() => vi.dynamicImportSettled());
    expect(await screen.findByText("Markdown Preview")).toBeInTheDocument();
    expect(await screen.findByText("Heading")).toBeInTheDocument();
    expect(await screen.findByText("Report body")).toBeInTheDocument();
  });

  it("updates the loaded Markdown preview and renders GFM tables", async () => {
    const { rerender } = render(<ReportDetailPage params={{ reportId: "report-1" }} />);
    await act(() => vi.dynamicImportSettled());
    expect(await screen.findByRole("heading", { name: "Heading" })).toBeInTheDocument();

    previewMock.content = "# Updated report\n\n| Check | Result |\n| --- | --- |\n| TLS | Passed |";
    rerender(<ReportDetailPage params={{ reportId: "report-1" }} />);

    expect(screen.getByRole("heading", { name: "Updated report" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Passed" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Heading" })).not.toBeInTheDocument();
  });
});
