import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useScanHistoryExport } from "@/lib/hooks/use-scan-history-export";

const downloadMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/api/download", () => ({ downloadFromApiGet: downloadMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useScanHistoryExport", () => {
  it("downloads the first filtered page with URL-encoded search", async () => {
    downloadMock.mockClear();
    const { result } = renderHook(() => useScanHistoryExport(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        search: "  example & test  ",
        sortBy: "domain_asc",
        statusGroup: "completed",
      });
    });

    const [path, filename] = downloadMock.mock.calls[0] as [string, string];
    const url = new URL(path, "https://example.com");
    expect(url.pathname).toBe("/scans/export.csv");
    expect(url.searchParams.get("search")).toBe("example & test");
    expect(url.searchParams.get("sort_by")).toBe("domain_asc");
    expect(url.searchParams.get("status_group")).toBe("completed");
    expect(url.searchParams.get("limit")).toBe("5000");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(filename).toBe("scan-history.csv");
  });
});
