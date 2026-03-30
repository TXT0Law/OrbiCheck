import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SecurityTxtDetail } from "@/components/scan/details/security-txt-detail";

describe("SecurityTxtDetail", () => {
  it("renders found security.txt fields", () => {
    render(
      <SecurityTxtDetail
        data={{
          exists: true,
          url: "/.well-known/security.txt",
          rawContent: "Contact: mailto:security@example.com",
          contact: "mailto:security@example.com",
          expires: "2027-01-01",
          encryption: "https://example.com/pgp",
          acknowledgments: "https://example.com/hall-of-fame",
          preferredLanguages: "en",
          policy: "https://example.com/policy",
        }}
      />,
    );

    expect(screen.getByText("Found")).toBeInTheDocument();
    expect(screen.getByText("/.well-known/security.txt")).toBeInTheDocument();
    expect(screen.getByText("mailto:security@example.com")).toBeInTheDocument();
  });

  it("renders not specified placeholders", () => {
    render(
      <SecurityTxtDetail
        data={{
          exists: false,
          url: "",
          rawContent: "",
          contact: null,
          expires: null,
          encryption: null,
          acknowledgments: null,
          preferredLanguages: null,
          policy: null,
        }}
      />,
    );

    expect(screen.getByText("Not Found")).toBeInTheDocument();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(1);
  });
});
