import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmailConfigDetail } from "@/components/scan/details/email-config-detail";

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
});
