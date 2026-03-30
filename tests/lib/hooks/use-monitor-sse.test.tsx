import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const invalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries,
  }),
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
}

vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

describe("useMonitorSSE hooks", () => {
  afterEach(() => {
    invalidateQueries.mockReset();
    MockEventSource.instances = [];
    delete process.env.NEXT_PUBLIC_MONITOR_USE_MOCK;
    delete process.env.NEXT_PUBLIC_MONITOR_SSE;
  });

  it("subscribes and invalidates list and detail queries for live monitor events", async () => {
    const mod = await import("@/lib/hooks/use-monitor-sse");
    renderHook(() => mod.useMonitorSSE());

    MockEventSource.instances[0].onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ id: "monitor-1", type: "change" }),
      }),
    );

    expect(MockEventSource.instances[0].url).toBe("/api/v1/monitors/live");
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("ignores heartbeat events and disabled detail subscriptions", async () => {
    const mod = await import("@/lib/hooks/use-monitor-sse");
    renderHook(() => mod.useMonitorDetailSSE("monitor-1", { monitorEnabled: false }));

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("invalidates only the matching detail query", async () => {
    const mod = await import("@/lib/hooks/use-monitor-sse");
    renderHook(() => mod.useMonitorDetailSSE("monitor-1"));

    MockEventSource.instances[0].onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ id: "monitor-1", type: "status" }),
      }),
    );

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
