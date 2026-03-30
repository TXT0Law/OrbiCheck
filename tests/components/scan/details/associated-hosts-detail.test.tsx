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
});
