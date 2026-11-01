import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useScanFindings } from "@/lib/hooks/use-scan-findings";

describe("useScanFindings", () => {
  it("keys queries by scan and polls only while projection is pending", () => {
    useQueryMock.mockReturnValue({ data: null });

    useScanFindings("scan-1");
    const query = useQueryMock.mock.lastCall?.[0] as {
      queryKey: unknown[];
      enabled: boolean;
      refetchInterval: (query: { state: { data?: { projectionStatus: string } } }) => number | false;
    };

    expect(query.queryKey).toEqual(["scan-findings", "scan-1", ""]);
    expect(query.enabled).toBe(true);
    expect(query.refetchInterval({ state: { data: { projectionStatus: "pending" } } })).toBe(60_000);
    expect(query.refetchInterval({ state: { data: { projectionStatus: "ready" } } })).toBe(false);
    expect(query.refetchInterval({ state: { data: { projectionStatus: "failed" } } })).toBe(false);
  });

  it("does not query without a scan id", () => {
    useQueryMock.mockReturnValue({ data: null });

    useScanFindings(undefined);

    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({ enabled: false });
  });

  it("waits for completion and keys findings by the scan run", () => {
    useQueryMock.mockReturnValue({ data: null });

    useScanFindings("scan-1", { scanStatus: "running", scanStartedAt: "run-2" });
    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({
      queryKey: ["scan-findings", "scan-1", "run-2"],
      enabled: false,
    });

    useScanFindings("scan-1", { scanStatus: "completed", scanStartedAt: "run-2" });
    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({ enabled: true });
  });
});
