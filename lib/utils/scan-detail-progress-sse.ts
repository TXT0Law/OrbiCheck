/**
 * Avoid duplicate EventSource when parent ScanLayout already streams progress for activeScan.
 */
export function shouldSubscribeDetailProgressSse(
  status: string | undefined,
  routeScanId: string,
  activeScanId: string | null | undefined
): boolean {
  if (status !== "pending" && status !== "running") {
    return false;
  }
  if (!activeScanId) {
    return true;
  }
  return activeScanId !== routeScanId;
}
