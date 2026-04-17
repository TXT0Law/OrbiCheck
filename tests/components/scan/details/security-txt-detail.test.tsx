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

  it("wraps long header URL and raw content blocks", () => {
    const longUrl =
      "https://www.example.com/.well-known/security.txt?cache_bust=01HXYZ&token=eyJabc.deflongjwt.signature";
    const longRawLine =
      "Encryption: https://example.com/pgp/very-long-key-fingerprint-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const longRaw = `Contact: mailto:security@example.com\n${longRawLine}\nPreferred-Languages: en, fr, ja`;

    const { container } = render(
      <SecurityTxtDetail
        data={{
          exists: true,
          url: longUrl,
          rawContent: longRaw,
          contact: "mailto:security@example.com",
          expires: "2027-01-01",
          encryption: null,
          acknowledgments: null,
          preferredLanguages: "en",
          policy: null,
        }}
      />,
    );

    const headerUrl = screen.getByText(longUrl);
    expect(headerUrl.className).toMatch(/break-all/);

    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain(longRawLine);
    expect(pre!.className).toMatch(/break-all/);
    expect(pre!.className).toMatch(/whitespace-pre-wrap/);
  });
});
