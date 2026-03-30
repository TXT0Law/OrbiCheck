import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScanProgress } from "@/lib/hooks/use-scan-progress";

type MockEventSourceInstance = {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: ReturnType<typeof vi.fn>;
};

const eventSources: MockEventSourceInstance[] = [];

class MockEventSource {
  url: string;

  onmessage: ((event: MessageEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    eventSources.push(this as unknown as MockEventSourceInstance);
  }
}

function HookHarness({ scanId, onComplete }: { scanId: string | null; onComplete?: () => void }) {
  const { progress, error } = useScanProgress({ scanId, onComplete });

  return (
    <div>
      <p data-testid="progress">{progress ? JSON.stringify(progress) : "none"}</p>
      <p data-testid="error">{error ?? "none"}</p>
    </div>
  );
}

describe("useScanProgress", () => {
  beforeEach(() => {
    eventSources.length = 0;
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when scanId is null", () => {
    render(<HookHarness scanId={null} />);

    expect(screen.getByTestId("progress")).toHaveTextContent("none");
    expect(screen.getByTestId("error")).toHaveTextContent("none");
    expect(eventSources).toHaveLength(0);
  });

  it("updates progress and calls onComplete when done", async () => {
    const onComplete = vi.fn();
    render(<HookHarness scanId="scan-1" onComplete={onComplete} />);

    expect(eventSources).toHaveLength(1);
    expect(eventSources[0].url).toContain("/api/v1/scans/scan-1/progress");

    act(() => {
      eventSources[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            progress: 100,
            phase: "done",
            detail: "Finished",
            completedModules: 30,
            totalModules: 30,
            done: true,
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("progress")).toHaveTextContent("\"phase\":\"done\"");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
  });

  it("closes and calls onComplete on bare done event", async () => {
    const onComplete = vi.fn();
    render(<HookHarness scanId="scan-bare" onComplete={onComplete} />);

    act(() => {
      eventSources[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({ done: true }),
        })
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
  });

  it("closes and calls onComplete when error payload has no done flag", async () => {
    const onComplete = vi.fn();
    render(<HookHarness scanId="scan-err" onComplete={onComplete} />);

    act(() => {
      eventSources[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            progress: 0,
            phase: "error",
            detail: "fatal",
            completedModules: 0,
            totalModules: 0,
            error: true,
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("progress")).toHaveTextContent("\"phase\":\"error\"");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
  });

  it("closes and calls onComplete when cancelled payload arrives", async () => {
    const onComplete = vi.fn();
    render(<HookHarness scanId="scan-can" onComplete={onComplete} />);

    act(() => {
      eventSources[0].onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            progress: 40,
            phase: "cancelled",
            detail: "Scan cancelled by user",
            completedModules: 4,
            totalModules: 28,
            cancelled: true,
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("progress")).toHaveTextContent("cancelled");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
  });

  it("sets parse error when stream payload is invalid", async () => {
    render(<HookHarness scanId="scan-2" />);

    act(() => {
      eventSources[0].onmessage?.(new MessageEvent("message", { data: "not-json" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Scan progress stream returned invalid payload.");
    });
  });

  it("sets disconnect error when stream fails", async () => {
    render(<HookHarness scanId="scan-3" />);

    act(() => {
      eventSources[0].onerror?.(new Event("error"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Scan progress stream disconnected.");
    });
    expect(eventSources[0].close).toHaveBeenCalledTimes(1);
  });
});
