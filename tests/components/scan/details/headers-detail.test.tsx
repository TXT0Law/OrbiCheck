import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeadersDetail } from "@/components/scan/details/headers-detail";

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
  });

  it("shows empty states when checks and raw headers are missing", () => {
    render(
      <HeadersDetail
        data={{ overallGrade: "F", responseHeaders: {}, securityChecks: [] }}
      />,
    );

    expect(screen.getByText("No security header checks available.")).toBeInTheDocument();
    expect(screen.getByText("No response headers captured.")).toBeInTheDocument();
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
});
