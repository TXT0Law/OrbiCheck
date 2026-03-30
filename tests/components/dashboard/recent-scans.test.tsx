import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentScans } from "@/components/dashboard/recent-scans";

const useScanListMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/use-scan-list", () => ({
  useScanList: (...args: unknown[]) => useScanListMock(...args),
}));

vi.mock("@/components/common/time-ago", () => ({
  TimeAgo: () => <span>1m ago</span>,
}));

describe("RecentScans", () => {
  beforeEach(() => {
    useScanListMock.mockReset();
  });

  it("renders loading skeletons", () => {
    useScanListMock.mockReturnValue({ isLoading: true });

    const { container } = render(<RecentScans />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders scan data with enhanced details", () => {
    useScanListMock.mockReturnValue({
      data: {
        scans: [
          {
            id: "scan-1",
            domain: "example.com",
            url: "https://example.com",
            status: "completed",
            progress: 100,
            totalModules: 10,
            completedModules: 10,
            securityScore: 82,
            errorMessage: null,
            startedAt: "2026-03-26T10:00:00.000Z",
            completedAt: "2026-03-26T10:01:12.000Z",
            createdAt: "2026-03-26T10:00:00.000Z",
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<RecentScans />);

    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Security score 82")).toBeInTheDocument();
    expect(screen.getByText("10/10 modules")).toBeInTheDocument();
    expect(screen.getByText("1m 12s")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute(
      "href",
      "/dashboard/scan"
    );
    expect(screen.getByRole("link", { name: /example.com/i })).toHaveAttribute(
      "href",
      "/dashboard/scan/scan-1"
    );
  });

  it("renders the empty state", () => {
    useScanListMock.mockReturnValue({
      data: { scans: [], total: 0 },
      isLoading: false,
      isError: false,
    });

    render(<RecentScans />);

    expect(screen.getByText("No scans yet.")).toBeInTheDocument();
  });

  it("renders inline errors and retries", () => {
    const refetchMock = vi.fn();
    useScanListMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("Failed to load scans"),
      refetch: refetchMock,
    });

    render(<RecentScans />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Failed to load scans")).toBeInTheDocument();
    expect(refetchMock).toHaveBeenCalled();
  });
});
