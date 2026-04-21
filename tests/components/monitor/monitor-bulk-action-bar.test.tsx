import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MonitorBulkActionBar } from "@/components/monitor/monitor-bulk-action-bar";
import { useMonitorStore } from "@/lib/stores/monitor-store";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/use-monitors", () => ({
  useBulkActOnMonitors: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

function selectIds(ids: string[]) {
  act(() => {
    useMonitorStore.getState().setSelectedMonitorIds(ids);
  });
}

describe("MonitorBulkActionBar", () => {
  beforeEach(() => {
    toastMock.mockReset();
    mutateAsync.mockReset();
    act(() => {
      useMonitorStore.getState().clearMonitorSelection();
    });
  });

  afterEach(() => {
    act(() => {
      useMonitorStore.getState().clearMonitorSelection();
    });
  });

  it("renders nothing when no monitors are selected", () => {
    const { container } = render(
      <MonitorBulkActionBar visibleMonitorIds={["a", "b"]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides itself when only hidden ids are selected", () => {
    selectIds(["hidden-1", "hidden-2"]);
    const { container } = render(
      <MonitorBulkActionBar visibleMonitorIds={["a", "b"]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the selected count for visible ids only", () => {
    selectIds(["a", "hidden", "b"]);
    render(<MonitorBulkActionBar visibleMonitorIds={["a", "b"]} />);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("calls bulk pause and shows success toast", async () => {
    mutateAsync.mockResolvedValueOnce({
      action: "pause",
      succeeded: ["a", "b"],
      failed: [],
      requested: 2,
    });
    selectIds(["a", "b"]);
    render(<MonitorBulkActionBar visibleMonitorIds={["a", "b"]} />);
    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "pause",
      monitorIds: ["a", "b"],
    });
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const args = toastMock.mock.calls[0][0];
    expect(args.title).toMatch(/2 monitors paused/i);
    expect(useMonitorStore.getState().selectedMonitorIds).toEqual([]);
  });

  it("surfaces partial failures with destructive toast when none succeed", async () => {
    mutateAsync.mockResolvedValueOnce({
      action: "disable",
      succeeded: [],
      failed: [
        { monitorId: "a", errorCode: "MONITOR_BUSY", message: "busy" },
      ],
      requested: 1,
    });
    selectIds(["a"]);
    render(<MonitorBulkActionBar visibleMonitorIds={["a"]} />);
    fireEvent.click(screen.getByRole("button", { name: /^disable$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const args = toastMock.mock.calls.at(-1)?.[0];
    expect(args.variant).toBe("destructive");
  });

  it("opens the confirmation dialog before bulk-deleting", async () => {
    selectIds(["a"]);
    render(<MonitorBulkActionBar visibleMonitorIds={["a"]} />);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(
      await screen.findByRole("alertdialog"),
    ).toHaveTextContent(/delete 1 monitor/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("clears the selection via the clear button", () => {
    selectIds(["a", "b"]);
    render(<MonitorBulkActionBar visibleMonitorIds={["a", "b"]} />);
    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(useMonitorStore.getState().selectedMonitorIds).toEqual([]);
  });
});
