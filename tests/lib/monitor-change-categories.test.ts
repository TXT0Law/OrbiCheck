import { describe, expect, it } from "vitest";

import {
  CHANGE_CATEGORY_MEDIUM_MAX,
  CHANGE_CATEGORY_SMALL_MAX,
  inferChangeCategoryForMonitorChange,
  inferChangeCategoryFromTotalLines,
} from "@/shared/constants/monitor-change-categories";

describe("monitor-change-categories", () => {
  it("defaults match backend change_category_defaults (10 / 50)", () => {
    expect(CHANGE_CATEGORY_SMALL_MAX).toBe(10);
    expect(CHANGE_CATEGORY_MEDIUM_MAX).toBe(50);
  });

  it("infers category from line counts", () => {
    expect(inferChangeCategoryFromTotalLines(0)).toBe("small");
    expect(inferChangeCategoryFromTotalLines(10)).toBe("small");
    expect(inferChangeCategoryFromTotalLines(11)).toBe("medium");
    expect(inferChangeCategoryFromTotalLines(50)).toBe("medium");
    expect(inferChangeCategoryFromTotalLines(51)).toBe("large");
  });

  it("respects server-provided changeCategory", () => {
    expect(
      inferChangeCategoryForMonitorChange({
        changeCategory: "large",
        linesAdded: 1,
        linesRemoved: 0,
      })
    ).toBe("large");
  });

  it("derives from totalDiffLines when category omitted", () => {
    expect(
      inferChangeCategoryForMonitorChange({
        totalDiffLines: 5,
        linesAdded: 99,
        linesRemoved: 99,
      })
    ).toBe("small");
  });
});
