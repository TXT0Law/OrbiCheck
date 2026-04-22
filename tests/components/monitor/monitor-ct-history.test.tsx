import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorCtHistory } from "@/components/monitor/monitor-ct-history";

const entriesHook = vi.fn();

vi.mock("@/lib/hooks/use-monitor-ct", () => ({
  useMonitorCtEntries: (...args: unknown[]) => entriesHook(...args),
}));

describe("MonitorCtHistory", () => {
  it("renders entries with pin violation styling", () => {
    entriesHook.mockReturnValue({
      data: [
        {
          id: "e1",
          monitorId: "m1",
          hostname: "example.com",
          serialNumber: "0a1b2c3d4e",
          leafSha256: "deadbeef".repeat(8),
          issuerName: "Let's Encrypt",
          commonName: "example.com",
          notBefore: "2026-04-01T00:00:00Z",
          notAfter: "2026-07-01T00:00:00Z",
          observedAt: "2026-04-21T12:00:00Z",
          crtshId: "9999",
          pinViolation: true,
          alertedAt: null,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<MonitorCtHistory monitorId="m1" />);
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText(/pin violation/i)).toBeInTheDocument();
    expect(screen.getByText(/let's encrypt/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /#9999/ }),
    ).toHaveAttribute("href", expect.stringContaining("crt.sh/?id=9999"));
  });

  it("renders empty state when no entries", () => {
    entriesHook.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<MonitorCtHistory monitorId="m1" />);
    expect(
      screen.getByText(/no ct log entries observed yet/i),
    ).toBeInTheDocument();
  });
});
