import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useScanDetailContext: vi.fn(),
  useScanDomainTimeline: vi.fn(),
  routerReplace: vi.fn(),
  searchParamsGet: vi.fn(() => null as string | null),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: mocks.searchParamsGet,
    toString: () => {
      const value = mocks.searchParamsGet("range");
      return value ? `range=${value}` : "";
    },
  }),
  useRouter: () => ({ replace: mocks.routerReplace }),
  usePathname: () => "/dashboard/scan/scan-1/trend",
}));

vi.mock("@/components/scan/scan-detail-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/scan/scan-detail-context")>();
  return {
    ...actual,
    useScanDetailContext: () => mocks.useScanDetailContext(),
  };
});

vi.mock("@/lib/hooks/use-scan-trend", () => ({
  useScanDomainTimeline: (...args: unknown[]) => mocks.useScanDomainTimeline(...args),
}));

vi.mock("@/components/scan/charts/scan-trend-chart", () => ({
  ScanTrendChart: ({
    data,
    isLoading,
  }: {
    data: { scanId: string }[];
    isLoading: boolean;
  }) => (
    <div data-testid="trend-chart">
      {isLoading ? "loading" : `points:${data.length}`}
    </div>
  ),
}));

import ScanTrendPage from "@/app/dashboard/scan/[scanId]/trend/page";

const detail = {
  id: "scan-1",
  domain: "example.com",
  url: "https://example.com",
  status: "completed",
} as const;

describe("ScanTrendPage", () => {
  beforeEach(() => {
    mocks.routerReplace.mockClear();
    mocks.searchParamsGet.mockReturnValue(null);
    mocks.useScanDetailContext.mockReturnValue({ detail });
    mocks.useScanDomainTimeline.mockReturnValue({
      data: { domain: "example.com", points: [{ scanId: "a" }, { scanId: "b" }] },
      isLoading: false,
      error: null,
    });
  });

  it("renders the trend chart with the resolved points", () => {
    render(<ScanTrendPage />);

    expect(screen.getByText(/Domain trend — example.com/i)).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toHaveTextContent("points:2");
  });

  it("shows the error state when the trend query fails", () => {
    mocks.useScanDomainTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network down"),
    });

    render(<ScanTrendPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(/network down/i);
  });

  it("router.replace is called when switching the range", () => {
    render(<ScanTrendPage />);

    fireEvent.click(screen.getByRole("button", { name: /last 30 days/i }));

    expect(mocks.routerReplace).toHaveBeenCalledWith(
      expect.stringContaining("range=30d"),
    );
  });

  it("uses 'all' as the default and clears the param when clicked", () => {
    mocks.searchParamsGet.mockReturnValue("30d");

    render(<ScanTrendPage />);

    fireEvent.click(screen.getByRole("button", { name: /all time/i }));

    expect(mocks.routerReplace).toHaveBeenCalledWith(
      "/dashboard/scan/scan-1/trend",
    );
  });
});
