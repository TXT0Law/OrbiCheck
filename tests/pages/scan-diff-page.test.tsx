import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useScanDiff: vi.fn(),
  searchParams: new Map<string, string>(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => mocks.searchParams.get(key) ?? null,
    toString: () => "",
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/use-scan-trend", () => ({
  useScanDiff: (...args: unknown[]) => mocks.useScanDiff(...args),
}));

vi.mock("@/components/scan/diff/scan-diff-view", () => ({
  ScanDiffView: ({
    diff,
  }: {
    diff: { baseScanId: string; compareScanId: string };
  }) => (
    <div data-testid="diff-view">
      diff:{diff.baseScanId}-{diff.compareScanId}
    </div>
  ),
}));

import ScanDiffPage from "@/app/dashboard/scan/diff/page";

describe("ScanDiffPage", () => {
  beforeEach(() => {
    mocks.searchParams.clear();
    mocks.useScanDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it("shows the missing-ID hint when no IDs are provided", () => {
    render(<ScanDiffPage />);

    expect(screen.getByText(/Missing scan IDs/i)).toBeInTheDocument();
  });

  it("shows the same-id hint when both IDs are equal", () => {
    mocks.searchParams.set("baseId", "abc");
    mocks.searchParams.set("compareId", "abc");

    render(<ScanDiffPage />);

    expect(
      screen.getByText(/Same scan selected on both sides/i),
    ).toBeInTheDocument();
  });

  it("shows the loading state while the query is in flight", () => {
    mocks.searchParams.set("baseId", "abc");
    mocks.searchParams.set("compareId", "def");
    mocks.useScanDiff.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<ScanDiffPage />);

    expect(screen.getByText(/Computing diff/i)).toBeInTheDocument();
  });

  it("shows the error fallback when the query rejects", () => {
    mocks.searchParams.set("baseId", "abc");
    mocks.searchParams.set("compareId", "def");
    mocks.useScanDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("404"),
    });

    render(<ScanDiffPage />);

    expect(screen.getByText(/Failed to load diff/i)).toBeInTheDocument();
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it("renders the diff view when data is available", () => {
    mocks.searchParams.set("baseId", "abc");
    mocks.searchParams.set("compareId", "def");
    mocks.useScanDiff.mockReturnValue({
      data: { baseScanId: "abc", compareScanId: "def" },
      isLoading: false,
      error: null,
    });

    render(<ScanDiffPage />);

    expect(screen.getByTestId("diff-view")).toHaveTextContent("diff:abc-def");
  });
});
