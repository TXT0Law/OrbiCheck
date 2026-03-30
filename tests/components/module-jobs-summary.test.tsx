import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { ModuleJobsSummary } from "@/components/scan/module-jobs-summary";

vi.mock("@/lib/api/scans", () => ({
  retryModule: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("ModuleJobsSummary", () => {
  it("renders nothing when moduleJobs is empty", () => {
    const { container } = renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={[]}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when moduleJobs is null/undefined", () => {
    const { container } = renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={null as unknown as []}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows correct status counts", () => {
    const moduleJobs = [
      { module: "ssl", status: "success" as const, durationMs: 275 },
      { module: "dns", status: "success" as const, durationMs: 301 },
      { module: "headers", status: "success" as const, durationMs: 89 },
      { module: "features", status: "skipped" as const, durationMs: 0 },
      { module: "get-ip", status: "failed" as const, durationMs: 216696, error: "Connection refused" },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    expect(screen.getByText(/3 successful/)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it("shows total duration", () => {
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={[{ module: "ssl", status: "success", durationMs: 275 }]}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    expect(screen.getByText(/Finished in 12\.5s/)).toBeInTheDocument();
  });

  it("details hidden by default", () => {
    const moduleJobs = [
      { module: "ssl", status: "success" as const, durationMs: 275 },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    expect(screen.queryByText("ssl")).not.toBeInTheDocument();
    expect(screen.getByText("Show Detail")).toBeInTheDocument();
  });

  it("clicking Show Details reveals module rows", () => {
    const moduleJobs = [
      { module: "ssl", status: "success" as const, durationMs: 275 },
      { module: "dns", status: "failed" as const, durationMs: 100, error: "err" },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    expect(screen.getByText("ssl")).toBeInTheDocument();
    expect(screen.getByText("dns")).toBeInTheDocument();
    expect(screen.getByText("Hide Detail")).toBeInTheDocument();
  });

  it("shows retry button for failed/timed-out/skipped modules", () => {
    const moduleJobs = [
      { module: "ssl", status: "success" as const, durationMs: 275 },
      { module: "dns", status: "failed" as const, durationMs: 100, error: "err" },
      { module: "ports", status: "timed-out" as const, durationMs: 30000 },
      { module: "features", status: "skipped" as const, durationMs: 0 },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    const retryButtons = screen.getAllByRole("button", { name: /retry/i });
    expect(retryButtons.length).toBe(3);
  });

  it("shows error toggle only for modules with error", () => {
    const moduleJobs = [
      { module: "dns", status: "failed" as const, durationMs: 100, error: "Connection refused" },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    expect(screen.getByText("■ Show Error")).toBeInTheDocument();
  });

  it("clicking Show Error reveals error message", () => {
    const moduleJobs = [
      { module: "dns", status: "failed" as const, durationMs: 100, error: "Connection refused" },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    fireEvent.click(screen.getByText("■ Show Error"));
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(screen.getByText("■ Hide Error")).toBeInTheDocument();
  });

  it("formats duration correctly", () => {
    const moduleJobs = [
      { module: "a", status: "success" as const, durationMs: 500 },
      { module: "b", status: "success" as const, durationMs: 1500 },
      { module: "c", status: "success" as const, durationMs: 65000 },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    expect(screen.getByText(/500 ms/)).toBeInTheDocument();
    expect(screen.getByText(/1\.5s/)).toBeInTheDocument();
    expect(screen.getByText(/1m 5s/)).toBeInTheDocument();
  });

  it("info footer text is present when expanded", () => {
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={[{ module: "ssl", status: "success", durationMs: 275 }]}
        totalDurationMs={12500}
        scanStatus="completed"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    expect(screen.getByText(/normal for some jobs to fail/)).toBeInTheDocument();
    expect(screen.getByText(/Check the browser console/)).toBeInTheDocument();
  });

  it("no retry button when scan is not in terminal state", () => {
    const moduleJobs = [
      { module: "dns", status: "failed" as const, durationMs: 100, error: "err" },
    ];
    renderWithClient(
      <ModuleJobsSummary
        scanId="scan-1"
        moduleJobs={moduleJobs}
        totalDurationMs={12500}
        scanStatus="running"
      />
    );
    fireEvent.click(screen.getByText("Show Detail"));
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
