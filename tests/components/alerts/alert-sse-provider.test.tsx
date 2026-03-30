import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlertSSEProvider } from "@/components/alerts/alert-sse-provider";

const toastMock = vi.fn();
const pushMock = vi.fn();

type MockEventSourceInstance = {
  onmessage: ((event: MessageEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
};

const eventSources: MockEventSourceInstance[] = [];

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();

  constructor(_url: string, _options?: unknown) {
    eventSources.push(this as unknown as MockEventSourceInstance);
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

function renderProvider(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertSSEProvider />
    </QueryClientProvider>
  );
}

describe("AlertSSEProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventSources.length = 0;
    vi.stubGlobal("EventSource", MockEventSource);
  });

  it("mounts without error", () => {
    const queryClient = new QueryClient();
    renderProvider(queryClient);
    expect(eventSources).toHaveLength(1);
  });

  it("parses alert_event and triggers toast", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderProvider(queryClient);

    eventSources[0].onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          id: "mon-1",
          event: "alert_event",
          data: {
            alertId: "alert-1",
            monitorId: "mon-1",
            capability: "uptime_only",
            eventType: "downtime",
            severity: "critical",
            actualValue: "consecutiveFailures:3",
            message: "Monitor is down",
            suppressed: false,
            suppressReason: null,
            createdAt: "2026-03-26T12:00:00Z",
          },
        }),
      })
    );

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  it("ignores suppressed alerts", () => {
    const queryClient = new QueryClient();
    renderProvider(queryClient);

    eventSources[0].onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          id: "mon-1",
          event: "alert_event",
          data: {
            alertId: "alert-1",
            monitorId: "mon-1",
            capability: "uptime_only",
            eventType: "downtime",
            severity: "critical",
            actualValue: "consecutiveFailures:3",
            message: "Monitor is down",
            suppressed: true,
            suppressReason: "quiet_hours",
            createdAt: "2026-03-26T12:00:00Z",
          },
        }),
      })
    );

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("ignores heartbeat messages", () => {
    const queryClient = new QueryClient();
    renderProvider(queryClient);

    eventSources[0].onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "heartbeat",
          ts: "2026-03-26T12:00:00Z",
        }),
      })
    );

    expect(toastMock).not.toHaveBeenCalled();
  });
});
