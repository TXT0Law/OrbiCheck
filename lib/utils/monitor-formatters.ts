/**
 * Defensive number formatters for monitor UI cards/charts.
 *
 * Why this module exists (Bug 7):
 *   `Number(null)` is `0`, `Number(undefined)` is `NaN`, and
 *   `(NaN).toFixed(2)` returns the literal string "NaN". When a backend
 *   payload momentarily lacks a numeric field (or schema validation upstream
 *   coerces `null` through), the raw `toFixed` / `Math.round` calls leak
 *   "NaN%" or "NaN ms" into the rendered UI. Every site that formats a
 *   numeric value MUST go through these helpers so the user sees the
 *   placeholder ("—") instead of broken text.
 *
 * Pure functions only — no React, no API client, no DOM access (lib/AGENTS.md
 * rule for `lib/utils/`).
 */

export const NO_VALUE_PLACEHOLDER = "—";

const SECONDS_PER_MINUTE = 60;
const DEFAULT_PERCENT_DECIMALS = 2;
const INTERVAL_MINUTE_DECIMALS = 1;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits: number = DEFAULT_PERCENT_DECIMALS,
): string {
  if (!isFiniteNumber(value)) return NO_VALUE_PLACEHOLDER;
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatMilliseconds(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NO_VALUE_PLACEHOLDER;
  return `${Math.round(value)} ms`;
}

/**
 * Format an integer count, defaulting to "0" for nullish/non-finite inputs
 * (counts are aggregations — "0" reads better than "—" in incident counters).
 * Negative inputs are clamped to 0 since a negative count would be a bug
 * upstream that we shouldn't propagate visually.
 */
export function formatCount(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "0";
  return String(Math.max(0, Math.trunc(value)));
}

/**
 * Format a check interval in seconds → human-readable string.
 * - Below one minute → "Ns"
 * - Whole minutes    → "Nm"
 * - Fractional minutes → "N.Xm" (single decimal — avoids "4.166666666666667m")
 * - Non-positive / non-finite → placeholder
 */
export function formatIntervalSeconds(
  seconds: number | null | undefined,
): string {
  if (!isFiniteNumber(seconds) || seconds <= 0) return NO_VALUE_PLACEHOLDER;
  if (seconds < SECONDS_PER_MINUTE) return `${Math.round(seconds)}s`;
  const minutes = seconds / SECONDS_PER_MINUTE;
  const rounded = Number.isInteger(minutes)
    ? minutes
    : Number(minutes.toFixed(INTERVAL_MINUTE_DECIMALS));
  return `${rounded}m`;
}

/**
 * Coerce an `unknown` Recharts tooltip payload (`number | string | null
 * | undefined`) into a finite number, or `null` if it isn't one.
 *
 * Why not just `Number(value)`?  `Number(null)` is `0`, which would render
 * "0 ms" for a missing data point — visually indistinguishable from a real
 * zero-latency measurement. We treat `null` / `undefined` / non-finite as
 * "no value" and let the caller pick the placeholder.
 */
function coerceTooltipNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format an `unknown` value for chart tooltips (Recharts hands us either a
 * number, a string, or `undefined` depending on the data point). Coerce
 * defensively and fall back to the placeholder rather than rendering "NaN ms".
 */
export function formatTooltipMs(value: unknown): string {
  const n = coerceTooltipNumber(value);
  if (n === null) return NO_VALUE_PLACEHOLDER;
  return `${Math.round(n)} ms`;
}

/**
 * Tooltip percent formatter — same defensive coercion as `formatTooltipMs`,
 * but renders as "N%" (rounded to integer for chart axes/tooltips). Returns
 * the placeholder for nullish / non-finite inputs.
 */
export function formatTooltipPercent(value: unknown): string {
  const n = coerceTooltipNumber(value);
  if (n === null) return NO_VALUE_PLACEHOLDER;
  return `${Math.round(n)}%`;
}
