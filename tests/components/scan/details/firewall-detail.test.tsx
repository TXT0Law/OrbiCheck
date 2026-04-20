import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FirewallDetail } from "@/components/scan/details/firewall-detail";

const LONG_EVIDENCE =
  "Detected via headers: cf-ray=8a1b2c3d4e5f6a7b-LAX,cf-cache-status=DYNAMIC,server=cloudflare,strict-transport-security=max-age=31536000; includeSubDomains; preload,via=1.1 google,x-amz-cf-id=verylongidentifierforcdnedgenodeabcdefg1234567890";

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

  it("wraps long evidence values inside the KeyValueCard", () => {
    render(
      <FirewallDetail
        data={{
          detected: true,
          provider: "Cloudflare",
          confidence: 88,
          evidence: LONG_EVIDENCE,
        }}
      />,
    );

    const evidenceText = screen.getByText(LONG_EVIDENCE);
    expect(evidenceText).toBeInTheDocument();

    const valueWrapper = evidenceText.parentElement;
    expect(valueWrapper).not.toBeNull();
    expect(valueWrapper!.className).toMatch(/break-all/);
    expect(valueWrapper!.className).toMatch(/min-w-0/);
  });
});
