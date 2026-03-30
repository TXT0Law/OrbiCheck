import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMonitorPeriod } from "@/lib/hooks/use-monitor-period";

const replaceMock = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/dashboard/monitor/x/uptime",
}));

describe("useMonitorPeriod", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    mockSearchParams.delete("period");
  });

  it("defaults to 24h when period param missing", () => {
    mockSearchParams.delete("period");
    const { result } = renderHook(() => useMonitorPeriod());
    expect(result.current.period).toBe("24h");
  });

  it("reads valid period from search params", () => {
    mockSearchParams.set("period", "7d");
    const { result } = renderHook(() => useMonitorPeriod());
    expect(result.current.period).toBe("7d");
    mockSearchParams.delete("period");
  });

  it("setPeriod updates URL via router.replace", () => {
    mockSearchParams.delete("period");
    const { result } = renderHook(() => useMonitorPeriod());
    act(() => {
      result.current.setPeriod("30d");
    });
    expect(replaceMock).toHaveBeenCalledWith("/dashboard/monitor/x/uptime?period=30d", {
      scroll: false,
    });
  });

  it("setPeriod clears param when default 24h", () => {
    mockSearchParams.set("period", "7d");
    const { result } = renderHook(() => useMonitorPeriod());
    act(() => {
      result.current.setPeriod("24h");
    });
    expect(replaceMock).toHaveBeenCalledWith("/dashboard/monitor/x/uptime", { scroll: false });
  });
});
