import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useGroupRunProgress } from "@/lib/hooks/use-url-groups";
import type { UrlGroupRun } from "@/types/url-group";

const RUN_PROGRESS = 50;
const MEMBER_COUNT = 2;
const COMPLETE_PROGRESS = 100;
const run: UrlGroupRun = {
  id: "run-a", groupId: "group-a", userId: null, status: "running",
  progress: RUN_PROGRESS, totalMembers: MEMBER_COUNT, queuedMembers: 0,
  runningMembers: 1, completedMembers: 1, failedMembers: 0,
  cancelledMembers: 0, skippedMembers: 0, concurrencyLimit: 1,
  errorMessage: null, createdAt: "2026-11-06T00:00:00Z",
  startedAt: null, completedAt: null, members: [],
};

class EventSourceStub {
  static instances: EventSourceStub[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() { EventSourceStub.instances.push(this); }
  emit(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}

function setup() {
  EventSourceStub.instances = [];
  vi.stubGlobal("EventSource", EventSourceStub);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

afterEach(() => vi.unstubAllGlobals());

describe("functional audit: group run progress stale state evidence", () => {
  it("clears previous progress when selecting another run", () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ runId }) => useGroupRunProgress("group-a", runId, true),
      { wrapper, initialProps: { runId: "run-a" } },
    );
    act(() => EventSourceStub.instances[0].emit(run));
    rerender({ runId: "run-b" });
    expect(result.current).toBeNull();
    expect(EventSourceStub.instances).toHaveLength(MEMBER_COUNT);
  });

  it("clears stale progress after disconnect and completed REST refresh", () => {
    const { wrapper, client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result, rerender } = renderHook(
      ({ enabled }) => useGroupRunProgress("group-a", "run-a", enabled),
      { wrapper, initialProps: { enabled: true } },
    );
    act(() => EventSourceStub.instances[0].emit(run));
    act(() => EventSourceStub.instances[0].onerror?.());
    client.setQueryData(["url-group-runs", "group-a", 0, 5], {
      runs: [{ ...run, status: "completed", progress: COMPLETE_PROGRESS }], total: 1,
    });
    rerender({ enabled: false });
    expect(invalidate).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
  it("ignores malformed payloads, wrong runs, and events from a closed subscription", () => {
    const { wrapper, client } = setup();
    const { result, rerender, unmount } = renderHook(
      ({ runId }) => useGroupRunProgress("group-a", runId, true),
      { wrapper, initialProps: { runId: "run-a" } },
    );
    const previous = EventSourceStub.instances[0];
    act(() => {
      previous.onmessage?.({ data: "invalid json" });
      previous.emit({ status: "invalid" });
      previous.emit({ ...run, id: "other-run" });
    });
    expect(result.current).toBeNull();
    rerender({ runId: "run-b" });
    act(() => previous.emit(run));
    expect(result.current).toBeNull();
    expect(client.getQueryData(["url-group-runs", "group-a", "run-a"])).toBeUndefined();
    unmount();
    expect(EventSourceStub.instances[1].close).toHaveBeenCalled();
  });

});
