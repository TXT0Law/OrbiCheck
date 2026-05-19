import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonitorVisualTimeline } from "@/components/monitor/monitor-visual-timeline";
import type {
  Monitor,
  MonitorVisualCapture,
  MonitorVisualChange,
} from "@/shared/types/monitor";

const useMonitorMock = vi.fn();
const useMonitorVisualChangesMock = vi.fn();
const useMonitorVisualCapturesMock = vi.fn();
const triggerCaptureNowMutateAsync = vi.fn();
const useTriggerVisualCaptureNowMock = vi.fn();

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitor: (...args: unknown[]) => useMonitorMock(...args),
  useMonitorVisualChanges: (...args: unknown[]) =>
    useMonitorVisualChangesMock(...args),
  useMonitorVisualCaptures: (...args: unknown[]) =>
    useMonitorVisualCapturesMock(...args),
  useTriggerVisualCaptureNow: (...args: unknown[]) =>
    useTriggerVisualCaptureNowMock(...args),
}));

function fakeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "mon-1",
    displayName: "Visual",
    url: "https://example.com",
    enabledCapabilities: ["visual_change"],
    capabilities: {},
    intervalSeconds: 300,
    httpMethod: "GET",
    expectedStatusCode: null,
    isEnabled: true,
    status: "up",
    capabilityStatuses: [],
    lastCheckAt: new Date(Date.now() - 60_000).toISOString(),
    lastStatusCode: 200,
    lastResponseTimeMs: 100,
    lastChangeDetectedAt: null,
    sslExpiryDays: null,
    totalChecks: 5,
    uptimePercentage: 100,
    avgResponseTimeMs: 100,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeCapture(overrides: Partial<MonitorVisualCapture> = {}): MonitorVisualCapture {
  return {
    id: "cap-1",
    monitorId: "mon-1",
    checkId: null,
    capturedAt: new Date().toISOString(),
    widthPx: 1280,
    heightPx: 720,
    viewportWidth: 1280,
    viewportHeight: 720,
    fullPage: false,
    perceptualHashHex: "0123456789abcdef",
    dhashAlgo: "dhash",
    isDiagnostic: false,
    ...overrides,
  };
}

function fakeChange(overrides: Partial<MonitorVisualChange> = {}): MonitorVisualChange {
  return {
    id: "chg-1",
    monitorId: "mon-1",
    detectedAt: new Date().toISOString(),
    previousCaptureId: "cap-prev",
    currentCaptureId: "cap-curr",
    diffSummary: {
      hammingDistance: 12,
      similarityPercent: 81,
      similarityThresholdPercent: 92,
      perceptualHashAlgo: "dhash",
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("MonitorVisualTimeline (V-3)", () => {
  it("renders the empty state with Capture now CTA when no captures exist", () => {
    useMonitorMock.mockReturnValue({ data: fakeMonitor() });
    useMonitorVisualChangesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useMonitorVisualCapturesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: false,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    expect(
      screen.getByText(/No visual regressions detected yet/i),
    ).toBeInTheDocument();
    const captureNow = screen.getByTestId("visual-capture-now-button");
    expect(captureNow).toBeEnabled();
    expect(captureNow.textContent).toMatch(/Capture now/i);
    expect(screen.getByText(/0 successful · 0 diagnostic/i)).toBeInTheDocument();
  });

  it("renders Loading state while queries are still fetching", () => {
    useMonitorMock.mockReturnValue({ data: undefined });
    useMonitorVisualChangesMock.mockReturnValue({ data: undefined, isLoading: true });
    useMonitorVisualCapturesMock.mockReturnValue({ data: undefined, isLoading: true });
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: false,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    expect(screen.getByText(/Loading visual history/i)).toBeInTheDocument();
  });

  it("flags the first successful capture as Baseline and diagnostic captures as Failed", () => {
    const baseline = fakeCapture({ id: "cap-baseline", isDiagnostic: false });
    const diagnostic = fakeCapture({
      id: "cap-diag",
      isDiagnostic: true,
      capturedAt: new Date(Date.now() - 30_000).toISOString(),
    });
    useMonitorMock.mockReturnValue({ data: fakeMonitor() });
    useMonitorVisualChangesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useMonitorVisualCapturesMock.mockReturnValue({
      data: { data: [baseline, diagnostic] },
      isLoading: false,
    });
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: false,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    expect(screen.getByText("Baseline")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/1 successful · 1 diagnostic/i)).toBeInTheDocument();
  });

  it("surfaces server error messages when Capture now fails", async () => {
    useMonitorMock.mockReturnValue({ data: fakeMonitor() });
    useMonitorVisualChangesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useMonitorVisualCapturesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    triggerCaptureNowMutateAsync.mockRejectedValueOnce(
      new Error("Manual capture limit reached for this monitor."),
    );
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: false,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    fireEvent.click(screen.getByTestId("visual-capture-now-button"));

    await waitFor(() => {
      expect(
        screen.getByText(/Manual capture limit reached/i),
      ).toBeInTheDocument();
    });
  });

  it("disables Capture now while the mutation is pending", () => {
    useMonitorMock.mockReturnValue({ data: fakeMonitor() });
    useMonitorVisualChangesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useMonitorVisualCapturesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: true,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    const captureNow = screen.getByTestId("visual-capture-now-button");
    expect(captureNow).toBeDisabled();
    expect(captureNow.textContent).toMatch(/Capturing/i);
  });

  it("renders visual change rows with similarity badges when changes exist", () => {
    const change = fakeChange();
    useMonitorMock.mockReturnValue({ data: fakeMonitor() });
    useMonitorVisualChangesMock.mockReturnValue({
      data: { data: [change] },
      isLoading: false,
    });
    useMonitorVisualCapturesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: false,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    expect(screen.getByText("81% similar")).toBeInTheDocument();
    expect(screen.getByText(/Δ 12 bits/i)).toBeInTheDocument();
  });

  it("renders changed block overlay for visual diff summaries", () => {
    const change = fakeChange({
      diffSummary: {
        hammingDistance: 12,
        similarityPercent: 81,
        similarityThresholdPercent: 92,
        perceptualHashAlgo: "dhash",
        changedBlocks: [0, 63],
      },
    });
    useMonitorMock.mockReturnValue({ data: fakeMonitor() });
    useMonitorVisualChangesMock.mockReturnValue({
      data: { data: [change] },
      isLoading: false,
    });
    useMonitorVisualCapturesMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useTriggerVisualCaptureNowMock.mockReturnValue({
      mutateAsync: triggerCaptureNowMutateAsync,
      isPending: false,
    });

    render(<MonitorVisualTimeline monitorId="mon-1" />);

    expect(screen.getAllByTestId("visual-diff-changed-block")).toHaveLength(2);
  });
});
