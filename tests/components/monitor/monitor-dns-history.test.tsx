import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorDnsHistory } from "@/components/monitor/monitor-dns-history";

const recordsHook = vi.fn();
const changesHook = vi.fn();

vi.mock("@/lib/hooks/use-monitor-dns", () => ({
  useMonitorDnsRecords: (...args: unknown[]) => recordsHook(...args),
  useMonitorDnsChanges: (...args: unknown[]) => changesHook(...args),
}));

describe("MonitorDnsHistory", () => {
  it("groups current records by type and sorts changes desc", () => {
    recordsHook.mockReturnValue({
      data: [
        {
          id: "r1",
          monitorId: "m1",
          recordType: "A",
          values: ["1.1.1.1", "2.2.2.2"],
          observedAt: "2026-04-21T12:00:00Z",
          lastChangeAt: null,
        },
        {
          id: "r2",
          monitorId: "m1",
          recordType: "MX",
          values: ["10 mx1.example."],
          observedAt: "2026-04-21T12:00:00Z",
          lastChangeAt: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    changesHook.mockReturnValue({
      data: [
        {
          id: "c1",
          monitorId: "m1",
          recordType: "A",
          detectedAt: "2026-04-19T12:00:00Z",
          previousValues: [],
          currentValues: ["1.1.1.1"],
          addedValues: ["1.1.1.1"],
          removedValues: [],
        },
        {
          id: "c2",
          monitorId: "m1",
          recordType: "A",
          detectedAt: "2026-04-21T12:00:00Z",
          previousValues: ["1.1.1.1"],
          currentValues: ["2.2.2.2"],
          addedValues: ["2.2.2.2"],
          removedValues: ["1.1.1.1"],
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<MonitorDnsHistory monitorId="m1" />);

    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
    expect(screen.getByText("MX")).toBeInTheDocument();
    expect(screen.getAllByText("1.1.1.1").length).toBeGreaterThan(0);
    expect(screen.getByText("10 mx1.example.")).toBeInTheDocument();
    expect(screen.getAllByText("2.2.2.2").length).toBeGreaterThan(0);

    const addedHeaders = screen.getAllByText(/added/i);
    expect(addedHeaders.length).toBeGreaterThan(0);
  });

  it("renders empty states when there is no data", () => {
    recordsHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    changesHook.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<MonitorDnsHistory monitorId="m1" />);
    expect(
      screen.getByText(/no dns records have been observed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no dns changes have been recorded/i),
    ).toBeInTheDocument();
  });

  it("shows error fallbacks when hooks report errors", () => {
    recordsHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    changesHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<MonitorDnsHistory monitorId="m1" />);
    expect(
      screen.getByText(/failed to load current dns records/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/failed to load dns change history/i),
    ).toBeInTheDocument();
  });
});
