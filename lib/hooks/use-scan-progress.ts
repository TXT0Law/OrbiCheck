import { useEffect, useRef, useState } from "react";

import type { ScanProgressEvent } from "@/shared/types/api";

const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
const isDefaultBackend =
  !raw ||
  raw === "http://localhost:8000" ||
  raw.startsWith("http://localhost:8000/") ||
  raw === "http://127.0.0.1:8000" ||
  raw.startsWith("http://127.0.0.1:8000/");
let PROGRESS_BASE: string;
if (isDefaultBackend) {
  PROGRESS_BASE = "/api/v1";
} else if (raw.startsWith("http")) {
  const base = raw.replace(/\/+$/, "");
  PROGRESS_BASE = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
} else {
  PROGRESS_BASE = "/api/v1";
}

type StreamPayload = ScanProgressEvent & { done?: boolean; cancelled?: boolean };

interface UseScanProgressOptions {
  scanId: string | null;
  onComplete?: () => void;
  /** Mirror hook state to Zustand (or null when scanId cleared). */
  onProgress?: (event: ScanProgressEvent | null) => void;
  onStreamError?: (message: string | null) => void;
}

export function useScanProgress({
  scanId,
  onComplete,
  onProgress,
  onStreamError,
}: UseScanProgressOptions) {
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  const onStreamErrorRef = useRef(onStreamError);
  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;
  onStreamErrorRef.current = onStreamError;

  useEffect(() => {
    if (!scanId) {
      setProgress(null);
      setError(null);
      onProgressRef.current?.(null);
      onStreamErrorRef.current?.(null);
      return;
    }

    const url = `${PROGRESS_BASE}/scans/${encodeURIComponent(scanId)}/progress`;
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;
    setError(null);
    onStreamErrorRef.current?.(null);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamPayload;

        const bareDoneOnly =
          data.done === true &&
          data.phase == null &&
          data.progress == null &&
          data.detail == null;

        if (bareDoneOnly) {
          source.close();
          onCompleteRef.current?.();
          return;
        }

        const terminal =
          data.done === true ||
          data.error === true ||
          data.cancelled === true ||
          data.phase === "error" ||
          data.phase === "cancelled" ||
          (data.progress ?? 0) >= 100;

        setProgress(data);
        onProgressRef.current?.(data);
        onStreamErrorRef.current?.(null);

        if (terminal) {
          source.close();
          onCompleteRef.current?.();
        }
      } catch (parseError) {
        console.error("Failed to parse scan progress event", { scanId, eventData: event.data, parseError });
        const msg = "Scan progress stream returned invalid payload.";
        setError(msg);
        onStreamErrorRef.current?.(msg);
      }
    };

    source.onerror = (event) => {
      console.error("Scan progress stream connection failed", { scanId, event });
      const msg = "Scan progress stream disconnected.";
      setError(msg);
      onStreamErrorRef.current?.(msg);
      source.close();
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [scanId]);

  return { progress, error };
}
