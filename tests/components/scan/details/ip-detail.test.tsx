import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IpDetail } from "@/components/scan/details/ip-detail";

describe("IpDetail", () => {
  it("renders core IP fields", () => {
    render(
      <IpDetail
        data={{
          ip: "93.184.216.34",
          asn: "AS15133",
          isp: "Example ISP",
          org: "Example Org",
          country: "United States",
          countryCode: "US",
          city: "Los Angeles",
          region: "California",
          lat: 0,
          lon: 0,
          hostingProvider: "Example Hosting",
          isHosting: true,
          ipType: "datacenter",
        }}
      />,
    );

    expect(screen.getByText("IP Intelligence")).toBeInTheDocument();
    expect(screen.getByText("93.184.216.34")).toBeInTheDocument();
    expect(screen.getByText("Example ISP")).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
  });

  it("renders fallback dashes for missing values", () => {
    render(
      <IpDetail
        data={{
          ip: "",
          asn: "",
          isp: "",
          org: "",
          country: "",
          countryCode: "",
          city: "",
          region: "",
          lat: null,
          lon: null,
          hostingProvider: "",
          isHosting: false,
          ipType: "",
        }}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(1);
  });

  it("renders partial data without crashing", () => {
    render(
      <IpDetail
        data={{
          ip: "1.2.3.4",
          asn: "",
          isp: "",
          org: "",
          country: "",
          countryCode: "",
          city: "",
          region: "",
          lat: null,
          lon: null,
          hostingProvider: "",
          isHosting: false,
          ipType: "",
        }}
      />,
    );

    expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
  });

  it("wraps long IP intelligence values without overflowing the card", () => {
    const longHost =
      "us-west-2.compute.internal.very-long-hosting-provider-fqdn.example-cloud.com";

    render(
      <IpDetail
        data={{
          ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
          asn: "AS15169 Google LLC, Mountain View, CA, US",
          isp: "Example ISP with a long descriptive marketing label",
          org: "Example Org",
          country: "United States",
          countryCode: "US",
          city: "Mountain View",
          region: "California",
          lat: 0,
          lon: 0,
          hostingProvider: longHost,
          isHosting: true,
          ipType: "datacenter",
        }}
      />,
    );

    const hostingCell = screen.getByText(longHost);
    expect(hostingCell.className).toMatch(/break-words/);
  });
});
