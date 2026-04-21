/**
 * Tag normalisation + free-form input parsing for the monitor list filters.
 *
 * The backend stores tags as lowercase, trimmed strings (`Monitor.tags`) and
 * the list endpoint matches case-sensitively against the indexed array. To
 * avoid silent "I typed Foo but only foo matches" surprises, this module
 * normalises EVERY tag the same way the backend would (`lowercase`, trim,
 * collapse internal whitespace, drop empty values). It also handles the
 * comma- and newline-separated input the user types into the filter chip
 * field.
 *
 * Pure utility — no React, no API imports (see `lib/AGENTS.md`).
 */

const MAX_TAG_LENGTH = 50;

export function normalizeMonitorTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compacted = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!compacted) return null;
  return compacted.slice(0, MAX_TAG_LENGTH);
}

/**
 * Parse a free-form string (commas, semicolons, or newlines) into a
 * de-duplicated, normalised list of monitor tags. Whitespace-only segments
 * are dropped silently.
 */
export function parseMonitorTagInput(raw: string): string[] {
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of raw.split(/[,\n;]+/)) {
    const tag = normalizeMonitorTag(segment);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function dedupeMonitorTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const norm = normalizeMonitorTag(tag);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export function tagsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const left = dedupeMonitorTags(a);
  const right = dedupeMonitorTags(b);
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((tag, i) => tag === sortedRight[i]);
}
