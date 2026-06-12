import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonitorListContent } from "@/components/monitor/monitor-list-content";
import { APPEARANCE_KEYS } from "@/lib/mock-data";
import { useMonitorStore } from "@/lib/stores/monitor-store";
import type { Monitor } from "@/shared/types/monitor";

const replaceMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn(() => "/dashboard/monitor"));
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
const useMonitorsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: vi.fn(() => ({ replace: replaceMock })),
  useSearchParams: searchParamsMock,
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: (...args: unknown[]) => useMonitorsMock(...args),
}));

vi.mock("@/lib/hooks/use-monitor-sse", () => ({
  useMonitorSSE: vi.fn(),
}));

vi.mock("@/components/monitor/monitor-bulk-action-bar", () => ({
  MonitorBulkActionBar: ({ visibleMonitorIds }: { visibleMonitorIds: string[] }) => (
    <div data-testid="bulk-action-bar">{visibleMonitorIds.join(",")}</div>
  ),
}));

vi.mock("@/components/monitor/monitor-list-table", () => ({
  MonitorListTable: ({ monitors }: { monitors: Monitor[] }) => (
    <div data-testid="monitor-list-table">
      {monitors.map((monitor) => (
        <span key={monitor.id}>{monitor.displayName}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/components/monitor/monitor-list-skeleton", () => ({
  MonitorListTableSkeleton: () => <div>Loading monitors...</div>,
}));

vi.mock("@/components/monitor/monitor-empty-state", () => ({
  MonitorEmptyState: () => <div>No monitors yet</div>,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "mon-1",
    displayName: "Example monitor",
    url: "https://example.test",
    enabledCapabilities: ["uptime_only"],
    capabilities: {},
    intervalSeconds: 60,
    httpMethod: "GET",
    expectedStatusCode: 200,
    isEnabled: true,
    status: "up",
    capabilityStatuses: [],
    lastCheckAt: null,
    lastStatusCode: 200,
    lastResponseTimeMs: 123,
    lastChangeDetectedAt: null,
    sslExpiryDays: null,
    totalChecks: 10,
    uptimePercentage: 99.5,
    avgResponseTimeMs: 120,
    tags: [],
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-19T12:00:00Z",
    ...overrides,
  } as Monitor;
}

describe("MonitorListContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    pathnameMock.mockReturnValue("/dashboard/monitor");
    searchParamsMock.mockReturnValue(new URLSearchParams());
    useMonitorStore.setState({
      statusFilter: null,
      searchQuery: "",
      selectedMonitorIds: [],
      tagFilters: [],
      tagMatch: "any",
      latencyMaxMs: null,
      uptimeMinPercent: null,
      sort: null,
    });
    useMonitorsMock.mockReturnValue({
      data: {
        data: [buildMonitor()],
        meta: { page: 1, limit: 20, total: 75 },
      },
      isLoading: false,
      isError: false,
    });
  });

  it("reads monitor pagination from URL and preserves page size when changing pages", () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("page=2&pageSize=50"));

    render(<MonitorListContent />);

    expect(useMonitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 50 }),
    );
    expect(screen.getByText("Page 2 of 2 · 75 total monitors")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(replaceMock).toHaveBeenCalledWith("/dashboard/monitor?pageSize=50", {
      scroll: false,
    });
  });

  it("renders monitor pagination controls in Chinese", () => {
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");
    searchParamsMock.mockReturnValue(new URLSearchParams("page=2&pageSize=50"));

    render(<MonitorListContent />);

    expect(screen.getByText("第 2 / 2 頁 · 共 75 個監控")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一頁" })).toBeInTheDocument();
    expect(screen.getByText("每頁筆數")).toBeInTheDocument();
  });

  it("resets monitor pagination when list filters change", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("page=3"));

    render(<MonitorListContent />);

    act(() => {
      useMonitorStore.getState().setSearchQuery("changed");
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/monitor", {
        scroll: false,
      });
    });
  });

  it("redirects out-of-range monitor pages instead of showing the empty state", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("page=999"));
    useMonitorsMock.mockReturnValue({
      data: {
        data: [],
        meta: { page: 999, limit: 20, total: 75 },
      },
      isLoading: false,
      isError: false,
    });

    render(<MonitorListContent />);

    expect(screen.queryByText("No monitors yet")).not.toBeInTheDocument();
    expect(
      screen.getByText("This monitor page is empty. Redirecting to the last available page..."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/monitor?page=4", {
        scroll: false,
      });
    });
  });
});
