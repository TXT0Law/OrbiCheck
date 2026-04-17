import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssociatedHostsDetail } from "@/components/scan/details/associated-hosts-detail";
import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

describe("AssociatedHostsDetail", () => {
  it("shows empty state when no hosts", () => {
    render(<AssociatedHostsDetail data={{ hosts: [], totalFound: 0, domain: "example.com" }} />);
    expect(screen.getByText("Associated Hosts")).toBeInTheDocument();
    expect(
      screen.getByText(/No associated hosts discovered for this domain \(example\.com\)/)
    ).toBeInTheDocument();
  });

  it("renders hosts table from scan detail shape", () => {
    render(<AssociatedHostsDetail data={MOCK_SCAN_DETAIL.associatedHosts!} />);

    expect(screen.getByText("Associated Hosts")).toBeInTheDocument();
    expect(screen.getByText(/Found 5 associated hosts/)).toBeInTheDocument();
    expect(screen.getByText("Hostname")).toBeInTheDocument();
    expect(screen.getByText("www.example.com")).toBeInTheDocument();
  });

  it("wraps long hostname and IP cells inside the table", () => {
    const longHostname =
      "very-long-subdomain-host-name-that-might-overflow-the-card-boundary.example.com";
    const longIp = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";

    render(
      <AssociatedHostsDetail
        data={{
          domain: "example.com",
          totalFound: 1,
          hosts: [
            {
              hostname: longHostname,
              source: "certificate",
              ip: longIp,
            },
          ],
        }}
      />,
    );

    const hostnameCell = screen.getByText(longHostname);
    expect(hostnameCell.className).toMatch(/break-all/);
    expect(hostnameCell.className).toMatch(/max-w-\[/);

    const ipCell = screen.getByText(longIp);
    expect(ipCell.className).toMatch(/break-all/);
    expect(ipCell.className).toMatch(/max-w-\[/);
  });
});
