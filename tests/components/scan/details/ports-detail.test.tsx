import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PortsDetail } from "@/components/scan/details/ports-detail";

const longBanner =
  "HTTP/1.1 400 Bad Request | Server: cloudflare | CF-RAY: 9e899571bf5220f3-HKG | " +
  "X-POWERED-BY: edge-runtime | Proxy-Status: cloudflare; error=http_request_error";

function buildData() {
  return {
    engine: "nmap" as const,
    profile: "standard" as const,
    method: "nmap -sT -sV -T3 --top-ports 1000",
    durationMs: 12345,
    startTime: "2026-04-08T00:00:00.000Z",
    endTime: "2026-04-08T00:00:12.000Z",
    hostStatus: { up: true, latency: 123, method: "tcp-connect" },
    scanSummary: {
      notShown: "Not shown: 1 closed ports, 1 filtered ports.",
      closedCount: 1,
      filteredCount: 1,
      totalPortsScanned: 4,
    },
    detectedTechnologies: ["nginx"],
    osFingerprint: null,
    entries: [
      {
        port: 443,
        protocol: "tcp" as const,
        service: "https",
        state: "closed" as const,
        reason: "conn-refused",
        banner: "",
      },
      {
        port: 23,
        protocol: "tcp" as const,
        service: "telnet",
        state: "open" as const,
        reason: "syn-ack",
        banner: "",
      },
      {
        port: 8080,
        protocol: "tcp" as const,
        service: "http",
        state: "filtered" as const,
        reason: "no-response",
        banner: "",
      },
      {
        port: 80,
        protocol: "tcp" as const,
        service: "http",
        state: "open" as const,
        reason: "syn-ack",
        banner: "nginx",
        version: "nginx 1.27",
      },
    ],
  };
}

function getMainTable() {
  return screen.getAllByRole("table")[0]!;
}

describe("PortsDetail", () => {
  it("renders state and reason columns plus host summary", () => {
    render(<PortsDetail data={buildData()} />);

    expect(screen.getByText("Open Port Scan")).toBeInTheDocument();
    expect(screen.getByText("Engine: nmap")).toBeInTheDocument();
    expect(screen.getByText("Profile: standard")).toBeInTheDocument();
    expect(screen.getByText("Detected technologies: nginx")).toBeInTheDocument();
    expect(screen.getByText("2 open")).toBeInTheDocument();
    expect(screen.getByText("1 closed")).toBeInTheDocument();
    expect(screen.getByText("1 filtered")).toBeInTheDocument();
    expect(screen.getByText(/Host is up \(0\.123s latency\)\./)).toBeInTheDocument();
    expect(screen.getByText(/Not shown: 1 closed ports, 1 filtered ports\./)).toBeInTheDocument();
    expect(screen.getByText(/Scan started: 2026-04-08T00:00:00.000Z/)).toBeInTheDocument();
    expect(screen.getByText(/Completed: 2026-04-08T00:00:12.000Z/)).toBeInTheDocument();
    expect(screen.getByText(/Duration: 12\.35s/)).toBeInTheDocument();

    const table = getMainTable();
    expect(within(table).getByText("State")).toBeInTheDocument();
    expect(within(table).getByText("Reason")).toBeInTheDocument();
    expect(within(table).getAllByText("syn-ack")).toHaveLength(2);
  });

  it("defaults to open ports and supports filter toggles", () => {
    render(<PortsDetail data={buildData()} />);

    let table = getMainTable();
    expect(within(table).getByText("23")).toBeInTheDocument();
    expect(within(table).getByText("80")).toBeInTheDocument();
    expect(within(table).queryByText("443")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    table = getMainTable();
    expect(within(table).getByText("443")).toBeInTheDocument();
    expect(within(table).getByText("conn-refused")).toBeInTheDocument();
    expect(within(table).queryByText("23")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    table = getMainTable();
    expect(within(table).getByText("23")).toBeInTheDocument();
    expect(within(table).getByText("443")).toBeInTheDocument();
    expect(within(table).getByText("8080")).toBeInTheDocument();
  });

  it("renders colored state badges", () => {
    render(<PortsDetail data={buildData()} />);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const table = getMainTable();
    expect(within(table).getAllByText("open")[0]).toHaveClass(
      "border-emerald-300",
      "bg-emerald-50",
      "text-emerald-700",
    );
    expect(within(table).getByText("closed")).toHaveClass(
      "border-red-300",
      "bg-red-50",
      "text-red-700",
    );
    expect(within(table).getByText("filtered")).toHaveClass(
      "border-amber-300",
      "bg-amber-50",
      "text-amber-700",
    );
  });

  it("renders CDN warning when behindProxy is true", () => {
    render(
      <PortsDetail
        data={{
          ...buildData(),
          behindProxy: true,
          proxyProvider: "Cloudflare",
          note: "Target appears to be behind a CDN/proxy.",
          entries: [
            { port: 80, protocol: "tcp", service: "http", state: "open", reason: "syn-ack", banner: "cloudflare" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Results may reflect CDN")).toBeInTheDocument();
    expect(screen.getByText(/CDN\/Proxy detected \(Cloudflare\):/)).toBeInTheDocument();
    expect(screen.getByText("Target appears to be behind a CDN/proxy.")).toBeInTheDocument();
  });

  it("downgrades dangerous port warning to yellow when behindProxy is true", () => {
    render(
      <PortsDetail
        data={{
          ...buildData(),
          behindProxy: true,
          proxyProvider: "Cloudflare",
          entries: [
            { port: 23, protocol: "tcp", service: "telnet", state: "open", reason: "syn-ack", banner: "cloudflare" },
          ],
        }}
      />,
    );

    const warning = screen.getByText("High-risk ports appear open but may be CDN ports: 23.");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveClass("border-yellow-300", "bg-yellow-50", "text-yellow-700");
  });

  it("truncates long tech detection text and can expand", () => {
    render(
      <PortsDetail
        data={{
          entries: [
            {
              port: 80,
              protocol: "tcp",
              service: "http",
              state: "open",
              reason: "syn-ack",
              banner: longBanner,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(screen.getByText(/HTTP\/1\.1 400 Bad Request/)).toBeInTheDocument();
    expect(screen.queryByText(longBanner)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(screen.getByText(longBanner)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Less" })).toBeInTheDocument();
  });

  it("stays compatible with legacy data that lacks optional metadata fields", () => {
    render(
      <PortsDetail
        data={{
          entries: [
            { port: 443, protocol: "tcp", service: "https", state: "closed", banner: "" },
            { port: 80, protocol: "tcp", service: "http", state: "open", banner: "nginx" },
          ],
        }}
      />,
    );

    expect(screen.queryByText("Results may reflect CDN")).not.toBeInTheDocument();
    expect(screen.getByText("1 open")).toBeInTheDocument();
    expect(screen.getByText("1 closed")).toBeInTheDocument();
  });

  it("renders unavailable state for null data", () => {
    render(<PortsDetail data={null} />);

    expect(screen.getByText("Port scan data is unavailable for this scan.")).toBeInTheDocument();
  });

  it("renders empty state for no ports", () => {
    render(
      <PortsDetail
        data={{
          entries: [],
        }}
      />,
    );

    expect(screen.getByText("No port scan results were returned.")).toBeInTheDocument();
  });

  it("shows 'no open ports' message when all ports are closed/filtered", () => {
    render(
      <PortsDetail
        data={{
          entries: [
            { port: 443, protocol: "tcp", service: "https", state: "closed", reason: "conn-refused", banner: "" },
            { port: 25, protocol: "tcp", service: "smtp", state: "filtered", reason: "no-response", banner: "" },
          ],
        }}
      />,
    );

    expect(screen.getByText("No open ports detected.")).toBeInTheDocument();
    expect(screen.getByText("0 open")).toBeInTheDocument();
  });

  it("renders tech detection with product and version", () => {
    render(
      <PortsDetail
        data={{
          entries: [
            {
              port: 22,
              protocol: "tcp",
              service: "ssh",
              state: "open",
              reason: "syn-ack",
              banner: "OpenSSH 8.4",
              version: "OpenSSH 8.4",
              product: "OpenSSH",
              extraInfo: "Ubuntu",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/OpenSSH/)).toBeInTheDocument();
    expect(screen.getByText(/Ubuntu/)).toBeInTheDocument();
  });

  it("shows CDN false positive warning when open rate > 80%", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      port: 80 + i,
      protocol: "tcp" as const,
      service: "http",
      state: "open" as const,
      reason: "syn-ack",
      banner: "",
    }));
    entries.push({
      port: 3306,
      protocol: "tcp" as const,
      service: "mysql",
      state: "closed" as const,
      reason: "conn-refused",
      banner: "",
    });

    render(
      <PortsDetail
        data={{
          behindProxy: true,
          proxyProvider: "Cloudflare",
          entries,
        }}
      />,
    );

    expect(screen.getByText(/Port results may be unreliable/)).toBeInTheDocument();
  });
});
