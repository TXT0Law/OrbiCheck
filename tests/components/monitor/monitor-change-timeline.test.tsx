import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorChangeTimeline } from "@/components/monitor/monitor-change-timeline";

const useMonitorChangesInfinite = vi.fn();
vi.mock("@/lib/hooks/use-monitors", () => ({
  MONITOR_CHANGES_PAGE_SIZE: 20,
  useMonitorChangesInfinite: (...args: unknown[]) => useMonitorChangesInfinite(...args),
}));

const baseChange = {
  monitorId: "mon",
  detectedAt: new Date().toISOString(),
  previousSnapshotId: "p1",
  currentSnapshotId: "c1",
};

describe("MonitorChangeTimeline", () => {
  it("shows filter banner when URL-selected change is hidden by size filter", () => {
    const largeChange = {
      ...baseChange,
      id: "change-large",
      diffSummary: {
        linesAdded: 60,
        linesRemoved: 0,
        linesChanged: 0,
        totalDiffLines: 60,
        changeCategory: "large" as const,
      },
    };
    useMonitorChangesInfinite.mockReturnValue({
      data: {
        pages: [
          {
            data: [largeChange],
            meta: { page: 1, limit: 20, total: 1 },
          },
        ],
        pageParams: [1],
      },
      isLoading: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    });

    render(
      <MonitorChangeTimeline
        monitorId="mon"
        selectedChangeId="change-large"
        onSelectChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "small" } });

    expect(
      screen.getByText(/A change is selected from the URL but hidden by the current size filter/)
    ).toBeInTheDocument();
  });

  it("shows paging hint when selected id is not in loaded pages but more exist", () => {
    const page1 = Array.from({ length: 20 }, (_, i) => ({
      ...baseChange,
      id: `ch-${i}`,
      diffSummary: {
        linesAdded: 5,
        linesRemoved: 0,
        linesChanged: 0,
        totalDiffLines: 5,
        changeCategory: "small" as const,
      },
    }));
    useMonitorChangesInfinite.mockReturnValue({
      data: {
        pages: [{ data: page1, meta: { page: 1, limit: 20, total: 25 } }],
        pageParams: [1],
      },
      isLoading: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      hasNextPage: true,
    });

    render(
      <MonitorChangeTimeline
        monitorId="mon"
        selectedChangeId="missing-in-first-page"
        onSelectChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/This change is not in the loaded list yet/)
    ).toBeInTheDocument();
  });
});
