import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MonitorFilterBar } from "@/components/monitor/monitor-filter-bar";
import { useMonitorStore } from "@/lib/stores/monitor-store";

function resetStore() {
  act(() => {
    const s = useMonitorStore.getState();
    s.setSearchQuery("");
    s.setStatusFilter(null);
    s.resetAdvancedFilters();
  });
}

describe("MonitorFilterBar", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("commits a tag chip on Enter and dedupes case-insensitively", () => {
    render(<MonitorFilterBar />);
    const input = screen.getByLabelText(/^Tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Production" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "production" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useMonitorStore.getState().tagFilters).toEqual(["production"]);
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  it("supports comma-separated bulk paste", () => {
    render(<MonitorFilterBar />);
    const input = screen.getByLabelText(/^Tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alpha, beta, gamma" } });
    fireEvent.blur(input);
    expect(useMonitorStore.getState().tagFilters).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("removes a tag via the remove button", () => {
    act(() => {
      useMonitorStore.getState().setTagFilters(["one", "two"]);
    });
    render(<MonitorFilterBar />);
    fireEvent.click(screen.getByLabelText(/remove tag two/i));
    expect(useMonitorStore.getState().tagFilters).toEqual(["one"]);
  });

  it("toggles tag match between any and all", () => {
    render(<MonitorFilterBar />);
    fireEvent.click(screen.getByLabelText(/match all/i));
    expect(useMonitorStore.getState().tagMatch).toBe("all");
    fireEvent.click(screen.getByLabelText(/match any/i));
    expect(useMonitorStore.getState().tagMatch).toBe("any");
  });

  it("writes latency / uptime thresholds and clears via empty string", () => {
    render(<MonitorFilterBar />);
    fireEvent.change(screen.getByLabelText(/max latency/i), {
      target: { value: "750" },
    });
    fireEvent.change(screen.getByLabelText(/min uptime/i), {
      target: { value: "99.5" },
    });
    expect(useMonitorStore.getState().latencyMaxMs).toBe(750);
    expect(useMonitorStore.getState().uptimeMinPercent).toBe(99.5);

    fireEvent.change(screen.getByLabelText(/max latency/i), {
      target: { value: "" },
    });
    expect(useMonitorStore.getState().latencyMaxMs).toBeNull();
  });

  it("parses sort selection into the store", () => {
    render(<MonitorFilterBar />);
    fireEvent.change(screen.getByLabelText(/sort monitors/i), {
      target: { value: "uptimePercentage:desc" },
    });
    expect(useMonitorStore.getState().sort).toEqual({
      field: "uptimePercentage",
      direction: "desc",
    });
  });

  it("reset clears all advanced filters", () => {
    act(() => {
      useMonitorStore.getState().setTagFilters(["x"]);
      useMonitorStore.getState().setLatencyMaxMs(500);
      useMonitorStore
        .getState()
        .setSort({ field: "createdAt", direction: "asc" });
    });
    render(<MonitorFilterBar />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    const s = useMonitorStore.getState();
    expect(s.tagFilters).toEqual([]);
    expect(s.latencyMaxMs).toBeNull();
    expect(s.sort).toBeNull();
  });
});
