import { describe, expect, it } from "vitest";

import {
  dedupeMonitorTags,
  normalizeMonitorTag,
  parseMonitorTagInput,
  tagsEqual,
} from "@/lib/utils/monitor-tags";

describe("normalizeMonitorTag", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeMonitorTag("  Production Web  ")).toBe("production web");
  });

  it("returns null for non-string or empty input", () => {
    expect(normalizeMonitorTag(null)).toBeNull();
    expect(normalizeMonitorTag("   ")).toBeNull();
    expect(normalizeMonitorTag(123)).toBeNull();
  });

  it("truncates to 50 chars to match backend column", () => {
    const long = "x".repeat(80);
    expect(normalizeMonitorTag(long)?.length).toBe(50);
  });
});

describe("parseMonitorTagInput", () => {
  it("splits on commas, semicolons, and newlines", () => {
    expect(parseMonitorTagInput("alpha, beta;gamma\ndelta")).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });

  it("dedupes case-insensitively while preserving first occurrence order", () => {
    expect(parseMonitorTagInput("Alpha,alpha,BETA,beta")).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("returns empty list for blank input", () => {
    expect(parseMonitorTagInput("")).toEqual([]);
    expect(parseMonitorTagInput("   ,;\n,;")).toEqual([]);
  });
});

describe("dedupeMonitorTags / tagsEqual", () => {
  it("dedupes and normalises", () => {
    expect(dedupeMonitorTags(["A", "a", " b ", "C"])).toEqual(["a", "b", "c"]);
  });

  it("compares ignoring order and case", () => {
    expect(tagsEqual(["a", "b"], ["B", "A"])).toBe(true);
    expect(tagsEqual(["a"], ["a", "b"])).toBe(false);
  });
});
