import { rowsToCsv, type CsvRow } from "@/lib/utils/export-csv";

/**
 * GET binary/text from API with cookies and trigger a browser download.
 */
export async function downloadFromApiGet(path: string, filename: string): Promise<void> {
  const url = getBrowserApiAbsoluteUrl(path);
  const response = await fetch(url, { credentials: "include", method: "GET" });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export function downloadCsv(filename: string, rows: readonly CsvRow[]): void {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csv = rowsToCsv(rows, headers);
  downloadBlob(filename, new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8",
  }));
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
}

function downloadBlob(filename: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function getBrowserApiAbsoluteUrl(apiPath: string): string {
  const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  const normalizedApiPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const isDefaultBackend =
    !rawApiUrl ||
    rawApiUrl === "http://localhost:8000" ||
    rawApiUrl.startsWith("http://localhost:8000/") ||
    rawApiUrl === "http://127.0.0.1:8000" ||
    rawApiUrl.startsWith("http://127.0.0.1:8000/");
  const basePath =
    !isDefaultBackend && rawApiUrl.startsWith("http")
      ? rawApiUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1"
      : "/api/v1";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = basePath.startsWith("http")
    ? basePath
    : `${origin}${basePath.replace(/\/$/, "")}`;

  return `${baseUrl.replace(/\/$/, "")}${normalizedApiPath}`;
}
