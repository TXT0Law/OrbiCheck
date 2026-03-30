const ACTIVE_SCAN_STATUSES = new Set(["pending", "running"]);

/**
 * True when the scan is still in flight and this module slice has not been
 * persisted yet (null / undefined). Used to show SectionSkeleton instead of
 * "unavailable" so users do not confuse in-progress with failure.
 */
export function isScanModuleAwaitingData(
  status: string | undefined,
  moduleData: unknown
): boolean {
  return (
    status != null &&
    ACTIVE_SCAN_STATUSES.has(status) &&
    moduleData == null
  );
}
