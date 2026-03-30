import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { ScanDetailProvider, useScanDetailContext } from "@/components/scan/scan-detail-context";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

function Consumer() {
  const { detail, isError, isLoading, scanId } = useScanDetailContext();
  return (
    <div>
      <span data-testid="domain">{detail.domain}</span>
      <span data-testid="scan-id">{scanId}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="error">{String(isError)}</span>
    </div>
  );
}

describe("ScanDetailProvider", () => {
  it("exposes detail from context", () => {
    render(
      <ScanDetailProvider
        value={{
          scanId: "scan-1",
          detail: MOCK_SCAN_DETAIL,
          isLoading: false,
          isError: false,
          error: null,
          isNotFound: false,
          isFetching: false,
          refetch: vi.fn(),
        }}
      >
        <Consumer />
      </ScanDetailProvider>
    );

    expect(screen.getByTestId("domain")).toHaveTextContent("example.com");
    expect(screen.getByTestId("scan-id")).toHaveTextContent("scan-1");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toHaveTextContent("false");
  });

  it("useScanDetailContext throws without provider", () => {
    const err = console.error;
    console.error = vi.fn();
    expect(() => render(<Consumer />)).toThrow(/useScanDetailContext must be used within ScanDetailProvider/);
    console.error = err;
  });
});
