import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDetail } from "@/components/scan/details/status-detail";

describe("StatusDetail", () => {
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
