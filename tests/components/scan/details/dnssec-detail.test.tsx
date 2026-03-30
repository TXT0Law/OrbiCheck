import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DnssecDetail } from "@/components/scan/details/dnssec-detail";

describe("DnssecDetail", () => {
  it("renders dnssec summary and records", () => {
    render(
      <DnssecDetail
        data={{
          enabled: true,
          valid: true,
          dsRecords: ["12345 13 2 abcdef"],
          dnskeyRecords: ["256 3 13 AwEAAbcd"],
          algorithm: "ECDSA",
          keyTag: 12345,
        }}
      />,
    );

    expect(screen.getByText("DNSSEC Summary")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByText("12345 13 2 abcdef")).toBeInTheDocument();
  });

  it("shows empty states for missing records", () => {
    render(
      <DnssecDetail
        data={{
          enabled: false,
          valid: false,
          dsRecords: [],
          dnskeyRecords: [],
          algorithm: "",
          keyTag: 0,
        }}
      />,
    );

    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Invalid")).toBeInTheDocument();
    expect(screen.getByText("No DS records found.")).toBeInTheDocument();
    expect(screen.getByText("No DNSKEY records found.")).toBeInTheDocument();
  });
});
