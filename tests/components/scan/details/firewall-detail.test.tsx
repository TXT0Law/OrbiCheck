import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FirewallDetail } from "@/components/scan/details/firewall-detail";

describe("FirewallDetail", () => {
  it("renders detected provider and evidence", () => {
    render(
      <FirewallDetail
        data={{
          detected: true,
          provider: "Cloudflare",
          confidence: 92,
          evidence: "cf-ray header",
        }}
      />,
    );

    expect(screen.getByText("Firewall Detection")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("renders fallback values for missing fields", () => {
    render(
      <FirewallDetail
        data={{
          detected: false,
          provider: null,
          confidence: Number.NaN,
          evidence: "",
        }}
      />,
    );

    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(1);
  });
});
