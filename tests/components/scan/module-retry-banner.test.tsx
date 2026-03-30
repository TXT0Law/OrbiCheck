import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { ModuleRetryBanner } from "@/components/scan/module-retry-banner";
import { retryModule } from "@/lib/api/scans";

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
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ModuleRetryBanner", () => {
  it("renders nothing when no retryable jobs for this segment", () => {
    const { container } = renderWithClient(
      <ModuleRetryBanner
        scanId="s1"
        scanStatus="completed"
        segment="ssl"
        moduleJobs={[{ module: "ssl", status: "success", durationMs: 1 }]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when scan is not terminal", () => {
    const { container } = renderWithClient(
      <ModuleRetryBanner
        scanId="s1"
        scanStatus="running"
        segment="ssl"
        moduleJobs={[{ module: "ssl", status: "failed", durationMs: 1, error: "x" }]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows banner and retries all segment-related failed modules", async () => {
    vi.mocked(retryModule).mockResolvedValue({
      module: "dns",
      status: "success",
      durationMs: 10,
    });

    renderWithClient(
      <ModuleRetryBanner
        scanId="s1"
        scanStatus="completed"
        segment="dns"
        moduleJobs={[
          { module: "dns", status: "failed", durationMs: 1, error: "timeout" },
          { module: "txt-records", status: "skipped", durationMs: 0 },
          { module: "ssl", status: "failed", durationMs: 1 },
        ]}
      />
    );

    expect(screen.getByRole("region", { name: /module retry/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry all modules here/i }));

    await waitFor(() => {
      expect(retryModule).toHaveBeenCalledTimes(2);
    });
    expect(retryModule).toHaveBeenCalledWith("s1", "dns");
    expect(retryModule).toHaveBeenCalledWith("s1", "txt-records");
  });

  it("uses singular copy for a single retryable job", () => {
    renderWithClient(
      <ModuleRetryBanner
        scanId="s1"
        scanStatus="completed"
        segment="tls"
        moduleJobs={[{ module: "tls", status: "timed-out", durationMs: 1 }]}
      />
    );
    expect(screen.getByRole("button", { name: /retry module$/i })).toBeInTheDocument();
  });
});
