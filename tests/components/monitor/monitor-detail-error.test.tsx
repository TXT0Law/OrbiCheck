import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { MonitorDetailError } from "@/components/monitor/monitor-detail-error";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("MonitorDetailError", () => {
  it("renders error message", () => {
    render(<MonitorDetailError error={new Error("Network failure")} onRetry={vi.fn()} />);
    expect(screen.getByText("Failed to load monitor")).toBeInTheDocument();
    expect(screen.getByText("Network failure")).toBeInTheDocument();
  });

  it("renders not-found specific message", () => {
    render(<MonitorDetailError error={new Error("Monitor not found")} onRetry={vi.fn()} />);
    expect(screen.getByText(/may have been deleted/)).toBeInTheDocument();
  });

  it("calls onRetry when retry button clicked", () => {
    const onRetry = vi.fn();
    render(<MonitorDetailError error={null} onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows retrying label when isRetrying", () => {
    render(<MonitorDetailError error={null} onRetry={vi.fn()} isRetrying />);
    expect(screen.getByText("Retrying…")).toBeInTheDocument();
  });

  it("has link back to monitors list", () => {
    render(<MonitorDetailError error={null} onRetry={vi.fn()} />);
    const link = screen.getByText("Back to Monitors").closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/monitor");
  });
});
