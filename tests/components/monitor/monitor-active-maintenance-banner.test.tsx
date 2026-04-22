import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorActiveMaintenanceBanner } from "@/components/monitor/monitor-active-maintenance-banner";

const activeHook = vi.fn();

vi.mock("@/lib/hooks/use-maintenance-windows", () => ({
  useActiveMaintenanceWindows: (...args: unknown[]) => activeHook(...args),
}));

describe("MonitorActiveMaintenanceBanner", () => {
  it("renders nothing when no windows are active", () => {
    activeHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(
      <MonitorActiveMaintenanceBanner monitorId="m1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while loading", () => {
    activeHook.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(
      <MonitorActiveMaintenanceBanner monitorId="m1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows active window with suppression badges and manage link", () => {
    activeHook.mockReturnValue({
      data: [
        {
          id: "w1",
          userId: 1,
          monitorId: null,
          title: "Quarterly upgrade",
          startsAt: "2026-04-21T11:00:00Z",
          endsAt: "2026-04-21T13:00:00Z",
          suppressAlerts: true,
          suppressProbes: true,
          isEnabled: true,
          notes: "Postgres major upgrade",
          recurrence: null,
          tagScope: null,
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<MonitorActiveMaintenanceBanner monitorId="m1" />);
    expect(
      screen.getByText(/in maintenance — quarterly upgrade/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/alerts suppressed/i)).toBeInTheDocument();
    expect(screen.getByText(/probes paused/i)).toBeInTheDocument();
    expect(screen.getByText(/postgres major upgrade/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage/i })).toHaveAttribute(
      "href",
      "/dashboard/settings/maintenance",
    );
  });
});
