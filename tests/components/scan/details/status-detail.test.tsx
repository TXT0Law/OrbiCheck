import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDetail } from "@/components/scan/details/status-detail";

describe("StatusDetail", () => {
  it.each([
    ["dns_error", "No HTTP response: DNS lookup failed"],
    ["tls_error", "No HTTP response: TLS connection failed"],
    ["timeout", "No HTTP response: request timed out"],
    ["circuit_open", "No HTTP response: circuit breaker open"],
    ["network_error", "No HTTP response: network connection failed"],
  ] as const)("explains %s without inventing a status or duration", (fetchOutcome, message) => {
    render(<StatusDetail data={{ httpStatusCode: null, responseTimeMs: null,
      fetchOutcome, serverHeader: "", contentType: "", redirectCount: null }} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("0ms")).not.toBeInTheDocument();
  });

  it.each([
    [403, "Access refused"],
    [429, "Rate limited"],
    [503, "Service unavailable"],
  ])("explains the actual HTTP %i response", (code, explanation) => {
    render(<StatusDetail data={{ httpStatusCode: code, responseTimeMs: 15,
      serverHeader: "", contentType: "", redirectCount: 0 }} />);
    expect(screen.getByText(String(code))).toBeInTheDocument();
    expect(screen.getByText(explanation)).toBeInTheDocument();
  });

  it("renders success status values", () => {
    render(
      <StatusDetail
        data={{
          httpStatusCode: 200,
          responseTimeMs: 123.4,
          serverHeader: "nginx",
          contentType: "text/html",
          redirectCount: 1,
        }}
      />,
    );

    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("123.4ms")).toBeInTheDocument();
    expect(screen.getByText("nginx")).toBeInTheDocument();
  });

  it("renders fallback dashes for partial data", () => {
    render(
      <StatusDetail
        data={{
          httpStatusCode: null as never,
          responseTimeMs: null as never,
          serverHeader: "",
          contentType: "",
          redirectCount: null as never,
        }}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(1);
    expect(screen.getByText("HTTP response unavailable")).toBeInTheDocument();
  });

  it("renders error status code", () => {
    render(
      <StatusDetail
        data={{
          httpStatusCode: 500,
          responseTimeMs: 10,
          serverHeader: "",
          contentType: "",
          redirectCount: 0,
        }}
      />,
    );

    expect(screen.getByText("500")).toBeInTheDocument();
  });
});
