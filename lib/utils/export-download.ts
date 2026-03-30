import { getBrowserApiAbsoluteUrl } from "@/lib/api/client";

/**
 * GET binary/text from API with cookies and trigger download (same-origin session).
 */
export async function downloadFromApiGet(path: string, filename: string): Promise<void> {
  const url = getBrowserApiAbsoluteUrl(path);
  const res = await fetch(url, { credentials: "include", method: "GET" });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
