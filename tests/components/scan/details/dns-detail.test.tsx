import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DnsDetail } from "@/components/scan/details/dns-detail";

import { LONG_TXT_RECORD } from "./long-value-fixtures";

const FULL_DATA = {
  a: ["93.184.216.34"],
  aaaa: ["2606:2800:220:1:248:1893:25c8:1946"],
  cname: ["www.example.com"],
  mx: ["mail.example.com"],
  ns: ["ns1.example.com"],
  txt: ["v=spf1 include:_spf.example.com ~all"],
  soa: ["ns1.example.com hostmaster.example.com"],
};

describe("DnsDetail", () => {
  it("renders record tabs and values", () => {
    render(<DnsDetail data={FULL_DATA} />);

    expect(screen.getByText("DNS Records")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByText("93.184.216.34")).toBeInTheDocument();
  });

  it("shows empty state for missing record values", () => {
    render(
      <DnsDetail
        data={{ a: [], aaaa: [], cname: [], mx: [], ns: [], txt: [], soa: [] }}
      />,
    );

    expect(screen.getByText("No records found.")).toBeInTheDocument();
  });

  it("renders partial data without crashing", () => {
    render(
      <DnsDetail
        data={{ a: ["1.1.1.1"], aaaa: [], cname: [], mx: [], ns: [], txt: [], soa: [] }}
      />,
    );

    expect(screen.getByText("1.1.1.1")).toBeInTheDocument();
  });

  it("wraps long TXT record entries instead of overflowing", () => {
    render(
      <DnsDetail
        data={{
          a: [],
          aaaa: [],
          cname: [],
          mx: [],
          ns: [],
          txt: [LONG_TXT_RECORD],
          soa: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "TXT" }));

    const cell = screen.getByText(LONG_TXT_RECORD);
    expect(cell.className).toMatch(/break-all/);
    expect(cell.className).toMatch(/min-w-0/);
  });
});
