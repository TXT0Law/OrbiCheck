import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AlertCountBadge } from "@/components/alerts/alert-count-badge";

const useAlertsMock = vi.fn();

vi.mock("@/lib/hooks/use-alerts", () => ({
  useAlerts: (...args: unknown[]) => useAlertsMock(...args),
}));

describe("AlertCountBadge", () => {
  it("renders count when greater than zero", () => {
    useAlertsMock.mockReturnValue({ data: { meta: { total: 7 } } });
    render(<AlertCountBadge />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders nothing when count is zero", () => {
    useAlertsMock.mockReturnValue({ data: { meta: { total: 0 } } });
    const { container } = render(<AlertCountBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "99+" when count exceeds limit', () => {
    useAlertsMock.mockReturnValue({ data: { meta: { total: 120 } } });
    render(<AlertCountBadge />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });
});
