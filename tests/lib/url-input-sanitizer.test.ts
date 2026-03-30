import { describe, expect, it } from "vitest";

import {
  parseUrls,
  parseAndValidateUrls,
  validateSingleUrl,
  validateUrlInput,
} from "@/lib/utils/url-input-sanitizer";

describe("parseUrls", () => {
  it("parses comma-separated URLs", () => {
    const input = "https://a.com, https://b.com, https://c.com";
    const result = parseUrls(input);
    expect(result).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
  });

  it("parses newline-separated URLs", () => {
    const input = "https://a.com\nhttps://b.com\nhttps://c.com";
    const result = parseUrls(input);
    expect(result).toHaveLength(3);
    expect(result).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
  });

  it("parses mixed separators", () => {
    const input = "https://a.com, https://b.com\nhttps://c.com";
    const result = parseUrls(input);
    expect(result).toHaveLength(3);
  });

  it("trims whitespace", () => {
    const input = "  https://a.com  ,  https://b.com  ";
    const result = parseUrls(input);
    expect(result).toEqual(["https://a.com", "https://b.com"]);
  });

  it("filters empty entries", () => {
    const input = "https://a.com,,, ,\n\n,https://b.com";
    const result = parseUrls(input);
    expect(result).toEqual(["https://a.com", "https://b.com"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseUrls("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(parseUrls("   \n  \n  ")).toEqual([]);
  });
});

describe("validateUrlInput", () => {
  it("accepts valid input", () => {
    const result = validateUrlInput("https://example.com");
    expect(result.valid).toBe(true);
  });

  it("rejects input exceeding max length", () => {
    const result = validateUrlInput("a".repeat(4097));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too long");
  });

  it("rejects script tags", () => {
    const result = validateUrlInput(
      "https://example.com/<script>alert(1)</script>"
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("unsafe");
  });

  it("rejects javascript: protocol", () => {
    const result = validateUrlInput("javascript:alert(1)");
    expect(result.valid).toBe(false);
  });

  it("rejects event handlers", () => {
    const result = validateUrlInput(
      'https://example.com" onerror="alert(1)'
    );
    expect(result.valid).toBe(false);
  });

  it("rejects vbscript", () => {
    const result = validateUrlInput("vbscript:MsgBox");
    expect(result.valid).toBe(false);
  });

  it("rejects control characters", () => {
    const result = validateUrlInput("https://example.com\x00");
    expect(result.valid).toBe(false);
  });

  it("rejects SQL injection patterns", () => {
    const result = validateUrlInput(
      "https://example.com'; DROP TABLE scans;--"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects data: HTML URLs", () => {
    const result = validateUrlInput("data:text/html,<h1>hi</h1>");
    expect(result.valid).toBe(false);
  });
});

describe("validateSingleUrl", () => {
  it("accepts valid HTTPS URL", () => {
    const result = validateSingleUrl("https://example.com");
    expect(result.valid).toBe(true);
  });

  it("accepts valid HTTP URL", () => {
    const result = validateSingleUrl("http://example.com");
    expect(result.valid).toBe(true);
  });

  it("rejects URL exceeding max length", () => {
    const result = validateSingleUrl(
      "https://example.com/" + "a".repeat(2048)
    );
    expect(result.valid).toBe(false);
  });

  it("rejects non-HTTP protocols", () => {
    const result = validateSingleUrl("ftp://example.com");
    expect(result.valid).toBe(false);
  });

  it("rejects localhost", () => {
    const result = validateSingleUrl("https://localhost");
    expect(result.valid).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    const result = validateSingleUrl("https://127.0.0.1");
    expect(result.valid).toBe(false);
  });

  it("rejects 10.x.x.x", () => {
    const result = validateSingleUrl("https://10.0.0.1");
    expect(result.valid).toBe(false);
  });

  it("rejects 192.168.x.x", () => {
    const result = validateSingleUrl("https://192.168.1.1");
    expect(result.valid).toBe(false);
  });

  it("rejects .local domains", () => {
    const result = validateSingleUrl("https://myserver.local");
    expect(result.valid).toBe(false);
  });

  it("rejects URL without valid hostname", () => {
    const result = validateSingleUrl("https://");
    expect(result.valid).toBe(false);
  });

  it("rejects URL without TLD", () => {
    const result = validateSingleUrl("https://localhost-not-a-domain");
    expect(result.valid).toBe(false);
  });
});

describe("parseAndValidateUrls", () => {
  it("full pipeline: valid multi-URL input", () => {
    const result = parseAndValidateUrls("https://a.com\nhttps://b.com");
    expect(result.urls).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects when exceeding max URL count", () => {
    const urls = Array.from(
      { length: 11 },
      (_, i) => `https://example${i}.com`
    ).join("\n");
    const result = parseAndValidateUrls(urls);
    expect(result.urls).toHaveLength(0);
    expect(result.errors.some((e) => e.includes("Too many"))).toBe(true);
  });

  it("filters invalid URLs and collects errors", () => {
    const result = parseAndValidateUrls(
      "https://valid.com\ninvalid\nhttps://also-valid.org"
    );
    expect(result.urls).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });

  it("auto-prepends https:// to bare domains", () => {
    const result = parseAndValidateUrls("example.com");
    expect(result.urls).toEqual(["https://example.com"]);
  });

  it("rejects entirely if raw input has XSS", () => {
    const result = parseAndValidateUrls(
      "<script>alert(1)</script>\nhttps://safe.com"
    );
    expect(result.urls).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
