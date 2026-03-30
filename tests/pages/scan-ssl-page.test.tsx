import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ScanSslPage from "@/app/dashboard/scan/[scanId]/ssl/page";
import type { ScanDetailContextValue } from "@/components/scan/scan-detail-context";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

const useScanDetailContextMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/scan/scan-detail-context", () => ({
  useScanDetailContext: () => useScanDetailContextMock(),
}));

function baseContext(overrides: Partial<ScanDetailContextValue> = {}): ScanDetailContextValue {
  return {
    scanId: "scan-1",
    detail: MOCK_SCAN_DETAIL,
    isLoading: false,
    isError: false,
    error: null,
    isNotFound: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("ScanSslPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScanDetailContextMock.mockReturnValue(baseContext());
  });

  it("renders SslDetail when detail and ssl are present", () => {
    render(wrap(<ScanSslPage />));

    expect(screen.getByText("SSL Certificate Overview")).toBeInTheDocument();
  });

  it("shows module empty copy when ssl field is null", () => {
    useScanDetailContextMock.mockReturnValue(
      baseContext({
        detail: { ...MOCK_SCAN_DETAIL, ssl: null as unknown as (typeof MOCK_SCAN_DETAIL)["ssl"] },
      })
    );

    render(wrap(<ScanSslPage />));

    expect(screen.getByText(/SSL data unavailable for this scan/i)).toBeInTheDocument();
  });
});
