import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WhoisDetail } from "@/components/scan/details/whois-detail";

describe("WhoisDetail", () => {
  it("renders whois table values", () => {
    render(
      <WhoisDetail
        data={{
          registrar: "Example Registrar",
          createdAt: "2020-01-01",
          updatedAt: "2024-01-01",
          expiresAt: "2030-01-01",
          nameservers: ["ns1.example.com", "ns2.example.com"],
          domainStatus: ["ok"],
        }}
      />,
    );

    expect(screen.getByText("WHOIS")).toBeInTheDocument();
    expect(screen.getByText("Example Registrar")).toBeInTheDocument();
    expect(screen.getByText("ns1.example.com, ns2.example.com")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders unavailable state for null data", () => {
    render(<WhoisDetail data={null} />);

    expect(
      screen.getByText("WHOIS data is unavailable for this scan."),
    ).toBeInTheDocument();
  });

  it("renders fallback markers for partial data", () => {
    render(
      <WhoisDetail
        data={{
          registrar: "",
          createdAt: "",
          updatedAt: "",
          expiresAt: "",
          nameservers: [],
          domainStatus: [],
        }}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(1);
  });
});
