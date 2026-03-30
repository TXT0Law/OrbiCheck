/**
 * Default diff line thresholds for content change categories.
 * Must match backend defaults: app.core.change_category_defaults (Settings.CHANGE_CATEGORY_*).
 */
export const CHANGE_CATEGORY_SMALL_MAX = 10;
export const CHANGE_CATEGORY_MEDIUM_MAX = 50;

export type ChangeSizeCategory = "small" | "medium" | "large";

/**
 * Classify by total diff line count (same rule as Python classify_change_category).
 */
export function inferChangeCategoryFromTotalLines(
  totalDiffLines: number,
  smallMax: number = CHANGE_CATEGORY_SMALL_MAX,
  mediumMax: number = CHANGE_CATEGORY_MEDIUM_MAX
): ChangeSizeCategory {
  if (totalDiffLines <= smallMax) return "small";
  if (totalDiffLines <= mediumMax) return "medium";
  return "large";
}

export interface DiffSummaryLike {
  changeCategory?: string;
  totalDiffLines?: number;
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Prefer server-provided changeCategory; else derive from line counts and defaults.
 */
export function inferChangeCategoryForMonitorChange(
  diffSummary: DiffSummaryLike,
  thresholds?: { smallMax?: number; mediumMax?: number }
): ChangeSizeCategory {
  const c = diffSummary.changeCategory;
  if (c === "small" || c === "medium" || c === "large") return c;
  const lines =
    typeof diffSummary.totalDiffLines === "number"
      ? diffSummary.totalDiffLines
      : diffSummary.linesAdded + diffSummary.linesRemoved;
  return inferChangeCategoryFromTotalLines(
    lines,
    thresholds?.smallMax ?? CHANGE_CATEGORY_SMALL_MAX,
    thresholds?.mediumMax ?? CHANGE_CATEGORY_MEDIUM_MAX
  );
}
