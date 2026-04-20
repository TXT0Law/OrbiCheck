import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmailConfigDetail } from "@/components/scan/details/email-config-detail";

import { LONG_DMARC_RAW, LONG_SPF_RAW } from "./long-value-fixtures";

describe("EmailConfigDetail", () => {
  it("renders mx records and email security checklist", () => {
    render(
      <EmailConfigDetail
        data={{
          mxRecords: [{ priority: 10, host: "mx.example.com" }],
          spf: { raw: "v=spf1 include:_spf.example.com ~all", status: "pass" },
          dkim: { found: true, selector: "selector1" },
          dmarc: { raw: "v=DMARC1; p=reject", policy: "reject", status: "pass" },
        }}
      />,
    );

    expect(screen.getByText("mx.example.com")).toBeInTheDocument();
    expect(screen.getAllByText("pass").length).toBeGreaterThan(1);
    expect(screen.getByText(/Selector: selector1/i)).toBeInTheDocument();
  });

  it("renders fallback values for partial payloads", () => {
    render(<EmailConfigDetail data={{}} />);

    expect(screen.getByText("No MX records found.")).toBeInTheDocument();
    expect(screen.getByText("Not Found")).toBeInTheDocument();
    expect(screen.getByText("Selector unavailable")).toBeInTheDocument();
  });

  it("wraps long SPF, DMARC, and MX host strings inside the cards", () => {
    const longMxHost =
      "very-long-mx-host-aspmx.l.google.com.fallback.relay.example-corp.internal";

    render(
      <EmailConfigDetail
        data={{
          mxRecords: [{ priority: 10, host: longMxHost }],
          spf: { raw: LONG_SPF_RAW, status: "pass" },
          dkim: { found: true, selector: "selector1" },
          dmarc: { raw: LONG_DMARC_RAW, policy: "reject", status: "pass" },
        }}
      />,
    );

    const mxCell = screen.getByText(longMxHost);
    expect(mxCell.className).toMatch(/break-all/);
    expect(mxCell.className).toMatch(/max-w-\[/);

    const spfRaw = screen.getByText(LONG_SPF_RAW);
    expect(spfRaw.className).toMatch(/break-all/);

    const dmarcRaw = screen.getByText(LONG_DMARC_RAW);
    expect(dmarcRaw.className).toMatch(/break-all/);
  });
});
