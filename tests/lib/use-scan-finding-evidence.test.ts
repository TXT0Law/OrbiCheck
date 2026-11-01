import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useScanFindingEvidence } from "@/lib/hooks/use-scan-finding-evidence";

describe("useScanFindingEvidence", () => {
  it("fetches only on demand and keys cached evidence by scan run and rule", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    useScanFindingEvidence("scan-1", "ssl.certificate_expiry", "run-2", false);
    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({
      queryKey: ["scan-findings", "scan-1", "run-2", "ssl.certificate_expiry", "evidence"],
      enabled: false,
    });

    useScanFindingEvidence("scan-1", "ssl.certificate_expiry", "run-2", true);
    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({ enabled: true });
  });
});
