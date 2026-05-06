import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useScanDomainTimeline: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("@/lib/hooks/use-scan-trend", () => ({
  useScanDomainTimeline: (...args: unknown[]) => mocks.useScanDomainTimeline(...args),
}));

import { CompareReportDialog } from "@/components/report/compare-report-dialog";
import type { ReportListItem } from "@/shared/types/report";

function buildReport(overrides: Partial<ReportListItem> = {}): ReportListItem {
  return {
    id: "report-1",
    title: "Security Report - example.com",
    format: "pdf",
    status: "completed",
    scanId: "scan-1",
    scanDomain: "example.com",
    fileSizeBytes: 4096,
    createdAt: "2026-05-04T00:00:00Z",
    completedAt: "2026-05-04T00:01:00Z",
    ...overrides,
  };
}

describe("CompareReportDialog", () => {
  beforeEach(() => {
    mocks.useScanDomainTimeline.mockReturnValue({
      data: { domain: "example.com", points: [] },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    mocks.routerPush.mockClear();
    mocks.useScanDomainTimeline.mockReset();
  });

  it("does not render when open is false", () => {
    render(
      <CompareReportDialog
        report={buildReport()}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the deleted-base hint when scanId is missing", () => {
    mocks.useScanDomainTimeline.mockReturnValue({
      data: { domain: "example.com", points: [] },
      isLoading: false,
      error: null,
    });

    render(
      <CompareReportDialog
        report={buildReport({ scanId: null })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/original scan for this report has been deleted/i),
    ).toBeInTheDocument();
  });

  it("shows the empty hint when no other scans exist for the domain", () => {
    mocks.useScanDomainTimeline.mockReturnValue({
      data: {
        domain: "example.com",
        points: [
          {
            scanId: "scan-1",
            completedAt: "2026-05-04T00:00:00Z",
            securityScore: 70,
            severity: { critical: 0, high: 0, medium: 0, low: 0 },
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(
      <CompareReportDialog
        report={buildReport()}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/No other completed scans of/i),
    ).toBeInTheDocument();
  });

  it("routes to /dashboard/scan/diff when the user picks a comparison scan", () => {
    mocks.useScanDomainTimeline.mockReturnValue({
      data: {
        domain: "example.com",
        points: [
          {
            scanId: "scan-1",
            completedAt: "2026-05-04T00:00:00Z",
            securityScore: 70,
            severity: { critical: 0, high: 0, medium: 0, low: 0 },
          },
          {
            scanId: "scan-2",
            completedAt: "2026-05-01T00:00:00Z",
            securityScore: 65,
            severity: { critical: 1, high: 0, medium: 0, low: 0 },
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    const onOpenChange = vi.fn();
    render(
      <CompareReportDialog
        report={buildReport()}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /view diff/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.routerPush).toHaveBeenCalledWith(
      "/dashboard/scan/diff?baseId=scan-1&compareId=scan-2",
    );
  });
});
