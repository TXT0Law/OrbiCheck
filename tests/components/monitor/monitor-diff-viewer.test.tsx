import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorDiffViewer } from "@/components/monitor/monitor-diff-viewer";
import { ApiError } from "@/lib/api/client";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    return function MockDiff() {
      return <div data-testid="mock-react-diff" />;
    };
  },
}));

const useMonitorDiff = vi.fn();
vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitorDiff: (...args: unknown[]) => useMonitorDiff(...args),
}));

describe("MonitorDiffViewer", () => {
  it("calls onInvalidChange when diff returns CHANGE_NOT_FOUND (status + code)", async () => {
    const onInvalidChange = vi.fn();
    useMonitorDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("Change not found", { status: 404, code: "CHANGE_NOT_FOUND" }),
    });

    render(
      <MonitorDiffViewer
        monitorId="m1"
        changeId="c1"
        onInvalidChange={onInvalidChange}
      />
    );

    await waitFor(() => {
      expect(onInvalidChange).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call onInvalidChange for SNAPSHOT_NOT_FOUND", async () => {
    const onInvalidChange = vi.fn();
    useMonitorDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("Purged", { status: 404, code: "SNAPSHOT_NOT_FOUND" }),
    });

    render(
      <MonitorDiffViewer
        monitorId="m1"
        changeId="c1"
        onInvalidChange={onInvalidChange}
      />
    );

    await waitFor(() => {
      expect(onInvalidChange).not.toHaveBeenCalled();
    });
  });

  it("does not rely on English substring alone: plain Error not found does not clear", async () => {
    const onInvalidChange = vi.fn();
    useMonitorDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("not found"),
    });

    render(
      <MonitorDiffViewer
        monitorId="m1"
        changeId="c1"
        onInvalidChange={onInvalidChange}
      />
    );

    await waitFor(() => {
      expect(onInvalidChange).not.toHaveBeenCalled();
    });
  });

  it("renders word diff operations with inserted and removed tokens", () => {
    useMonitorDiff.mockReturnValue({
      data: {
        changeId: "c1",
        previousContent: "old product",
        currentContent: "new product",
        diffHtml: "",
        wordDiff: {
          tokensAdded: 1,
          tokensRemoved: 1,
          totalTokenChanges: 2,
          truncated: false,
          operations: [{ type: "replace", removed: ["old"], added: ["new"] }],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MonitorDiffViewer monitorId="m1" changeId="c1" />);
    fireEvent.change(screen.getByDisplayValue("Line diff"), {
      target: { value: "word" },
    });

    expect(screen.getByTestId("word-diff-panel")).toBeInTheDocument();
    expect(screen.getByText("old").tagName.toLowerCase()).toBe("del");
    expect(screen.getByText("new").tagName.toLowerCase()).toBe("ins");
  });
});
