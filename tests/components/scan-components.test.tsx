import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { ScanProgress } from "@/components/scan/scan-progress";
import { ScanResultCard } from "@/components/scan/scan-result-card";
import { SubNav } from "@/components/scan/sub-nav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard/scan/scan-1/ssl"),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("scan components", () => {
  it("renders scan progress and handles stop", () => {
    const onCancel = vi.fn();

    render(
      <ScanProgress
        domain="example.com"
        progress={64}
        phase="medium"
        detail="Running modules"
        onCancel={onCancel}
      />
    );

    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop scan/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the current module chips and degraded-target banner (S-11)", () => {
    render(
      <ScanProgress
        domain="example.com"
        progress={42}
        phase="quick"
        detail="Running quick modules"
        currentModules={["status", "headers", "dns"]}
        degradedTarget={true}
        onCancel={() => {}}
      />
    );

    const chips = screen.getByTestId("scan-progress-current-modules");
    expect(chips).toHaveTextContent("status");
    expect(chips).toHaveTextContent("headers");
    expect(chips).toHaveTextContent("dns");
    expect(screen.getByTestId("scan-progress-degraded-target")).toBeInTheDocument();
  });

  it("collapses overflow modules into a +N badge (S-11)", () => {
    render(
      <ScanProgress
        domain="example.com"
        progress={70}
        phase="medium"
        detail="Running medium modules"
        currentModules={["a", "b", "c", "d", "e", "f", "g", "h"]}
        onCancel={() => {}}
      />
    );

    const chips = screen.getByTestId("scan-progress-current-modules");
    expect(chips).toHaveTextContent("+2");
    expect(screen.queryByTestId("scan-progress-degraded-target")).toBeNull();
  });

  it("uses fallback report link when href is unsafe", () => {
    const { rerender } = render(
      <ScanResultCard
        domain="example.com"
        score={75}
        duration="5s"
        severity={{ critical: 1, high: 2, medium: 3, low: 4 }}
        reportHref="/dashboard/scan/scan-1"
      />
    );

    expect(screen.getByRole("link", { name: /view full report/i })).toHaveAttribute("href", "/dashboard/scan/scan-1");

    rerender(
      <ScanResultCard
        domain="example.com"
        score={20}
        duration="5s"
        severity={{ critical: 0, high: 0, medium: 1, low: 2 }}
        reportHref="https://unsafe.test"
      />
    );

    expect(screen.getByRole("link", { name: /view full report/i })).toHaveAttribute("href", "/dashboard/scan");
  });

  it("renders scan sub-navigation links", () => {
    render(<SubNav scanId="scan-1" domain="example.com" />);

    expect(screen.getByText("Scanned Domain")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to scans/i })).toHaveAttribute("href", "/dashboard/scan");
    expect(screen.getByRole("link", { name: "SSL Certificate" })).toHaveAttribute("href", "/dashboard/scan/scan-1/ssl");
    expect(screen.getByRole("link", { name: "Dashboard Summary" })).toHaveAttribute("href", "/dashboard/scan/scan-1");
    expect(screen.getByRole("link", { name: "Screenshot & Page Source" })).toHaveAttribute(
      "href",
      "/dashboard/scan/scan-1/screenshot#page-source"
    );
  });
});
