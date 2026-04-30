import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ModuleErrorsCard } from "@/components/scan/summary/module-errors-card";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

describe("ModuleErrorsCard", () => {
  it("renders nothing when moduleErrors is empty (no noisy banner)", () => {
    const { container } = render(
      <ModuleErrorsCard detail={{ ...MOCK_SCAN_DETAIL, moduleErrors: {} }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one row per failed/timeout module with deep links when possible", () => {
    render(
      <ModuleErrorsCard
        detail={{
          ...MOCK_SCAN_DETAIL,
          moduleErrors: {
            ssl: {
              module: "ssl",
              frontendKey: "ssl",
              status: "failed",
              message: "TLS handshake failed",
            },
            "associated-hosts": {
              module: "associated-hosts",
              frontendKey: null,
              status: "timeout",
              message: "Module exceeded timeout",
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Module errors (2)")).toBeInTheDocument();
    expect(screen.getByText("TLS handshake failed")).toBeInTheDocument();
    expect(screen.getByText("Module exceeded timeout")).toBeInTheDocument();

    const sslLink = screen.getByText("ssl").closest("a");
    expect(sslLink?.getAttribute("href")).toBe("/dashboard/scan/scan-001/ssl");
  });

  it("labels failed and timeout statuses distinctly", () => {
    render(
      <ModuleErrorsCard
        detail={{
          ...MOCK_SCAN_DETAIL,
          moduleErrors: {
            ssl: {
              module: "ssl",
              frontendKey: "ssl",
              status: "failed",
              message: "x",
            },
            tls: {
              module: "tls",
              frontendKey: "tls",
              status: "timeout",
              message: "y",
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Timed out")).toBeInTheDocument();
  });
});
