import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
  const passthrough = (name: string) => {
    const Component = (props: { children?: React.ReactNode }) => (
      <div data-recharts={name}>{props.children}</div>
    );
    Component.displayName = `Mock(${name})`;
    return Component;
  };
  return {
    ResponsiveContainer: passthrough("ResponsiveContainer"),
    PieChart: passthrough("PieChart"),
    Pie: passthrough("Pie"),
    Cell: passthrough("Cell"),
    Tooltip: passthrough("Tooltip"),
    Legend: passthrough("Legend"),
  };
});

import { HeadersDetail } from "@/components/scan/details/headers-detail";

import { LONG_CSP, LONG_SET_COOKIE } from "./long-value-fixtures";

describe("HeadersDetail", () => {
  it("renders security checks and raw headers", () => {
    render(
      <HeadersDetail
        data={{
          overallGrade: "A",
          responseHeaders: {
            server: "nginx",
            "content-security-policy": "default-src 'self'",
          },
          securityChecks: [
            {
              name: "content-security-policy",
              status: "pass",
              value: "default-src 'self'",
            },
            {
              name: "x-frame-options",
              status: "missing",
              recommendation: "Add x-frame-options header.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Overall Grade A")).toBeInTheDocument();
    expect(screen.getAllByText("content-security-policy").length).toBeGreaterThan(1);
    expect(screen.getByText("server")).toBeInTheDocument();
    expect(screen.getByText("nginx")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Overall security headers grade A"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 pass")).toBeInTheDocument();
    expect(screen.getByText("0 fail")).toBeInTheDocument();
    expect(screen.getByText("1 missing")).toBeInTheDocument();
  });

  it("shows empty states when checks and raw headers are missing", () => {
    render(
      <HeadersDetail
        data={{ overallGrade: "F", responseHeaders: {}, securityChecks: [] }}
      />,
    );

    expect(screen.getByText("No security header checks available.")).toBeInTheDocument();
    expect(screen.getByText("No response headers captured.")).toBeInTheDocument();
    expect(
      screen.getByText(/Header status distribution unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders missing badge recommendations", () => {
    render(
      <HeadersDetail
        data={{
          overallGrade: "C",
          responseHeaders: {},
          securityChecks: [
            {
              name: "strict-transport-security",
              status: "missing",
              recommendation: "Add strict-transport-security header.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(
      screen.getByText("Add strict-transport-security header."),
    ).toBeInTheDocument();
  });

  it("wraps very long header values without truncating them", () => {
    render(
      <HeadersDetail
        data={{
          overallGrade: "A",
          responseHeaders: {
            "set-cookie": LONG_SET_COOKIE,
          },
          securityChecks: [
            {
              name: "content-security-policy",
              status: "pass",
              value: LONG_CSP,
              recommendation:
                "Tighten the policy by removing 'unsafe-inline' and 'unsafe-eval' once a nonce/hash strategy is rolled out across all inline scripts and styles.",
            },
          ],
        }}
      />,
    );

    const rawValue = screen.getByText(LONG_SET_COOKIE);
    expect(rawValue).toBeInTheDocument();
    expect(rawValue.className).toMatch(/break-all/);

    const cspValue = screen.getByText(LONG_CSP);
    expect(cspValue).toBeInTheDocument();
    expect(cspValue.className).toMatch(/break-all/);
    expect(cspValue.className).toMatch(/max-w-\[/);

    const recommendation = screen.getByText(
      /Tighten the policy by removing 'unsafe-inline'/,
    );
    expect(recommendation.className).toMatch(/break-words/);
    expect(recommendation.className).toMatch(/max-w-\[/);
  });
});
