import { describe, expect, it } from "vitest";

import {
  breakLongHtmlLines,
  extractHtmlTitleAndTextPreview,
} from "@/lib/utils/monitor-html-readability";

describe("monitor-html-readability", () => {
  it("extracts title and strips tags for preview", () => {
    const html = "<html><head><title>Hello &amp; world</title></head><body><p>Body text</p></body></html>";
    const { title, textPreview } = extractHtmlTitleAndTextPreview(html);
    expect(title).toContain("Hello");
    expect(textPreview).toContain("Body text");
  });

  it("breaks long minified HTML into multiple lines", () => {
    const one = "<div><p>a</p><p>b</p></div>";
    const out = breakLongHtmlLines(one.repeat(80));
    expect(out.split("\n").length).toBeGreaterThan(3);
  });

  it("leaves already multiline HTML unchanged", () => {
    const multi = "a\n".repeat(20);
    expect(breakLongHtmlLines(multi)).toBe(multi);
  });
});
