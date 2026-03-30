import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardLayout from "@/app/dashboard/layout";

const pathnameMock = vi.hoisted(() => vi.fn(() => "/dashboard"));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
}));

vi.mock("@/components/alerts/alert-sse-provider", () => ({
  AlertSSEProvider: () => <div data-testid="alert-sse-provider" />,
}));

vi.mock("@/components/layout/header", () => ({
  Header: () => <div>Header</div>,
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <div>Sidebar</div>,
}));

describe("dashboard layout auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dashboard shell on top-level dashboard routes", async () => {
    pathnameMock.mockReturnValue("/dashboard");

    render(
      <DashboardLayout>
        <div>Protected content</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });

    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("omits the shell on detail routes", async () => {
    pathnameMock.mockReturnValue("/dashboard/scan/scan-123");

    render(
      <DashboardLayout>
        <div>Protected content</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Protected content")).toBeInTheDocument();
    });

    expect(screen.queryByText("Sidebar")).not.toBeInTheDocument();
    expect(screen.queryByText("Header")).not.toBeInTheDocument();
  });
});
