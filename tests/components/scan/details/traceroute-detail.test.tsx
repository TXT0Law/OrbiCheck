import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TracerouteDetail } from "@/components/scan/details/traceroute-detail";

describe("TracerouteDetail", () => {
  it("renders hops and destination badge", () => {
    render(
      <TracerouteDetail
        data={{
          hops: [
            { hop: 1, ip: "10.0.0.1", hostname: "gateway", rttMs: 1.2 },
            { hop: 2, ip: "93.184.216.34", hostname: null, rttMs: 24.4 },
          ],
          totalHops: 2,
          destinationReached: true,
        }}
      />,
    );

    expect(screen.getByText("Traceroute Path")).toBeInTheDocument();
    expect(screen.getByText(/Destination reached: Yes/i)).toBeInTheDocument();
    expect(screen.getByText("Destination")).toBeInTheDocument();
  });

  it("renders unavailable state for null data", () => {
    render(<TracerouteDetail data={null} />);

    expect(
      screen.getByText("Traceroute data is unavailable for this scan."),
    ).toBeInTheDocument();
  });

  it("renders empty state with no hops", () => {
    render(
      <TracerouteDetail
        data={{ hops: [], totalHops: 0, destinationReached: false }}
      />,
    );

    expect(screen.getByText("No hops were returned by traceroute.")).toBeInTheDocument();
  });

  it("wraps long hostnames inside the hops table", () => {
    const longHostname =
      "edge-router-xx04-aggregator-iad-04-very-long-fqdn.providernet.example.com";

    render(
      <TracerouteDetail
        data={{
          hops: [{ hop: 7, ip: "203.0.113.42", hostname: longHostname, rttMs: 12.4 }],
          totalHops: 7,
          destinationReached: false,
        }}
      />,
    );

    const cell = screen.getByText(longHostname);
    expect(cell.className).toMatch(/break-all/);
    expect(cell.className).toMatch(/max-w-\[/);
  });
});
