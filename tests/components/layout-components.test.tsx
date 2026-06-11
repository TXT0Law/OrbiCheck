import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { SubNav } from "@/components/scan/sub-nav";

const pushMock = vi.fn();
const setTheme = vi.fn();
const pathnameMock = vi.hoisted(() => vi.fn(() => "/dashboard/scan"));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: pushMock })),
  usePathname: pathnameMock,
}));

vi.mock("next-themes", () => ({
  useTheme: vi.fn(() => ({ resolvedTheme: "light", setTheme })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual("@/lib/auth");
  return {
    ...actual,
    getUserEmail: vi.fn(() => "agent@test.local"),
    logout: vi.fn(),
  };
});

vi.mock("@/components/alerts/alert-count-badge", () => ({
  AlertCountBadge: () => <span>3</span>,
}));

describe("layout components", () => {
  it("toggles theme in header and shows the current page title", () => {
    pathnameMock.mockReturnValue("/dashboard/monitor");

    const { container } = render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(container.querySelector("header")?.className).toContain("bg-card");
  });

  it("renders the mobile menu trigger when a callback is provided", () => {
    pathnameMock.mockReturnValue("/dashboard");
    const onMenuClick = vi.fn();

    render(<Header onMenuClick={onMenuClick} />);

    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders sidebar links and active section", () => {
    pathnameMock.mockReturnValue("/dashboard/scan");

    render(<Sidebar />);

    expect(screen.getByAltText("OrbiCheck logo")).toBeInTheDocument();
    expect(screen.getByText("OrbiCheck")).toBeInTheDocument();
    const scanLinks = screen.getAllByRole("link", { name: /scan/i });
    expect(scanLinks.length).toBeGreaterThan(0);
    expect(scanLinks[0]).toHaveAttribute("href", "/dashboard/scan");
    expect(screen.getByText("agent@test.local")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/dashboard/reports");
    expect(screen.queryByText("Soon")).not.toBeInTheDocument();
  });

  it("uses theme tokens for scan detail navigation", () => {
    pathnameMock.mockReturnValue("/dashboard/scan/scan-1/headers");

    const { container } = render(<SubNav scanId="scan-1" domain="example.test" />);

    expect(container.querySelector("aside")?.className).toContain("bg-card");
    expect(screen.getByRole("link", { name: /back to scans/i }).className).toContain(
      "hover:bg-accent",
    );
  });
});
