import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatIntervalSeconds,
  formatMilliseconds,
  formatPercent,
  formatTooltipMs,
  formatTooltipPercent,
  NO_VALUE_PLACEHOLDER,
} from "@/lib/utils/monitor-formatters";

describe("formatPercent", () => {
  it("formats a finite number with two decimals by default", () => {
    expect(formatPercent(99.95)).toBe("99.95%");
  });

  it("respects the fractionDigits parameter", () => {
    expect(formatPercent(99.95, 3)).toBe("99.950%");
    expect(formatPercent(50, 0)).toBe("50%");
  });

  it("returns the placeholder for null / undefined / NaN / +-Infinity", () => {
    expect(formatPercent(null)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatPercent(undefined)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatPercent(Number.NaN)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe(NO_VALUE_PLACEHOLDER);
  });
});

describe("formatMilliseconds", () => {
  it("rounds and appends 'ms' for finite numbers", () => {
    expect(formatMilliseconds(123.6)).toBe("124 ms");
    expect(formatMilliseconds(0)).toBe("0 ms");
  });

  it("returns the placeholder for invalid inputs", () => {
    expect(formatMilliseconds(null)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatMilliseconds(undefined)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatMilliseconds(Number.NaN)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatMilliseconds(Number.POSITIVE_INFINITY)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatMilliseconds(Number.NEGATIVE_INFINITY)).toBe(NO_VALUE_PLACEHOLDER);
  });
});

describe("formatCount", () => {
  it("returns the integer count for finite numbers", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(7)).toBe("7");
    expect(formatCount(7.9)).toBe("7");
  });

  it("clamps negative counts to 0 (defensive)", () => {
    expect(formatCount(-3)).toBe("0");
  });

  it("returns '0' for null / undefined / NaN", () => {
    expect(formatCount(null)).toBe("0");
    expect(formatCount(undefined)).toBe("0");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("formatIntervalSeconds", () => {
  it("formats sub-minute values with seconds", () => {
    expect(formatIntervalSeconds(15)).toBe("15s");
    expect(formatIntervalSeconds(59)).toBe("59s");
  });

  it("formats whole minutes without a decimal", () => {
    expect(formatIntervalSeconds(60)).toBe("1m");
    expect(formatIntervalSeconds(300)).toBe("5m");
  });

  it("formats fractional minutes with a single decimal (regression for 4.166666… bug)", () => {
    expect(formatIntervalSeconds(250)).toBe("4.2m");
  });

  it("returns the placeholder for non-positive / invalid inputs", () => {
    expect(formatIntervalSeconds(0)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatIntervalSeconds(-5)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatIntervalSeconds(null)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatIntervalSeconds(undefined)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatIntervalSeconds(Number.NaN)).toBe(NO_VALUE_PLACEHOLDER);
  });
});

describe("formatTooltipMs", () => {
  it("formats numeric tooltip payloads", () => {
    expect(formatTooltipMs(123)).toBe("123 ms");
    expect(formatTooltipMs("456")).toBe("456 ms");
  });

  it("returns the placeholder for non-finite payloads", () => {
    expect(formatTooltipMs(undefined)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatTooltipMs(null)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatTooltipMs("not-a-number")).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatTooltipMs(Number.NaN)).toBe(NO_VALUE_PLACEHOLDER);
  });
});

describe("formatTooltipPercent", () => {
  it("formats numeric tooltip payloads as percent", () => {
    expect(formatTooltipPercent(99)).toBe("99%");
    expect(formatTooltipPercent("50")).toBe("50%");
  });

  it("returns the placeholder for non-finite payloads", () => {
    expect(formatTooltipPercent(undefined)).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatTooltipPercent("nope")).toBe(NO_VALUE_PLACEHOLDER);
    expect(formatTooltipPercent(Number.NaN)).toBe(NO_VALUE_PLACEHOLDER);
  });
});
