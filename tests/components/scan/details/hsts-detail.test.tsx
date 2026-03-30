import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HstsDetail } from "@/components/scan/details/hsts-detail";

describe("HstsDetail", () => {
  it("renders enabled hsts fields", () => {
    render(
      <HstsDetail
        data={{
          enabled: true,
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
          rawHeader: "max-age=31536000; includeSubDomains; preload",
        }}
      />,
    );

    expect(screen.getByText("HSTS Check")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText(/31536000 seconds/i)).toBeInTheDocument();
    expect(screen.getAllByText("✓").length).toBeGreaterThan(1);
  });

  it("renders disabled values", () => {
    render(
      <HstsDetail
        data={{
          enabled: false,
          maxAge: 0,
          includeSubDomains: false,
          preload: false,
          rawHeader: "",
        }}
      />,
    );

    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getAllByText("✗").length).toBeGreaterThan(1);
  });
});
