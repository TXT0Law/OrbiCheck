import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useScanDetail } from "@/lib/hooks/use-scan-detail";
import { useScanList } from "@/lib/hooks/use-scan-list";

describe("query hooks", () => {
  it("builds scan detail query options", () => {
    useQueryMock.mockReturnValue({ data: null });

    useScanDetail("scan-1");

    const queryConfig = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      enabled: boolean;
      retry: number;
      staleTime: number;
      refetchInterval: (q: { state: { data?: { status?: string } } }) => number | false;
    };
    expect(queryConfig.queryKey).toEqual(["scan-detail", "scan-1"]);
    expect(queryConfig.enabled).toBe(true);
    expect(queryConfig.retry).toBe(2);
    expect(queryConfig.staleTime).toBe(60_000);
    expect(queryConfig.refetchInterval({ state: { data: { status: "running" } } })).toBe(3000);
    expect(queryConfig.refetchInterval({ state: { data: { status: "completed" } } })).toBe(false);
  });

  it("builds scan list query options with custom refetch interval", () => {
    useQueryMock.mockReturnValue({ data: null });

    useScanList(
      {
        page: 2,
        size: 15,
        search: "example",
        sortBy: "security_score_desc",
        statusGroup: "active",
      },
      { refetchInterval: 3000 }
    );

    const queryConfig = useQueryMock.mock.calls[1][0] as {
      queryKey: unknown[];
      staleTime: number;
      refetchInterval: number | false | undefined;
    };
    expect(queryConfig.queryKey).toEqual(["scans", 2, 15, "example", "security_score_desc", "active"]);
    expect(queryConfig.staleTime).toBe(30_000);
    expect(queryConfig.refetchInterval).toBe(3000);
  });
});
