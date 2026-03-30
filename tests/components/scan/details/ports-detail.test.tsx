import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PortsDetail } from "@/components/scan/details/ports-detail";

describe("PortsDetail", () => {
  it("renders a table of ports", () => {
    render(
      <PortsDetail
        data={[
          { port: 80, protocol: "tcp", service: "http", state: "open", banner: "nginx" },
          { port: 443, protocol: "tcp", service: "https", state: "closed", banner: "" },
        ]}
      />,
    );

    expect(screen.getByText("Open Port Scan")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("http")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("renders unavailable state for null data", () => {
    render(<PortsDetail data={null} />);

    expect(
      screen.getByText("Port scan data is unavailable for this scan."),
    ).toBeInTheDocument();
  });

  it("renders empty state for no ports", () => {
    render(<PortsDetail data={[]} />);

    expect(
      screen.getByText("No open or closed ports were returned."),
    ).toBeInTheDocument();
  });
});
