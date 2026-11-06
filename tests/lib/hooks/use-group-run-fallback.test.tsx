import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useGroupRuns } from "@/lib/hooks/use-url-groups";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/url-groups", async (original) => ({
  ...await original<typeof import("@/lib/api/url-groups")>(),
  listGroupRuns: mocks.list,
}));
const REFRESH_MS = 3000;
afterEach(() => vi.useRealTimers());
it("refreshes active runs at a bounded interval and stops on completion and unmount", async () => {
  vi.useFakeTimers();
  mocks.list.mockResolvedValueOnce({ runs: [{ status: "running" }], total: 1 })
    .mockResolvedValue({ runs: [{ status: "completed" }], total: 1 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { unmount } = renderHook(() => useGroupRuns("group-a", 0, 5), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(mocks.list).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS); });
  expect(mocks.list).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS); });
  expect(mocks.list).toHaveBeenCalledTimes(2);
  unmount();
  await vi.advanceTimersByTimeAsync(REFRESH_MS);
  expect(mocks.list).toHaveBeenCalledTimes(2);
  client.clear();
});
