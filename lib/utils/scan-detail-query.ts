/** Heuristic: API client surfaces backend "not found" as Error(message). */
export function isLikelyScanNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /not found/i.test(msg);
}
