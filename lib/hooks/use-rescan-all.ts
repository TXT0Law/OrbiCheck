import { useCallback, useRef, useState } from "react";

import { rescanScan } from "@/lib/api/scans";
import type { ScanResponse } from "@/shared/types/api";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
const DELAY_MS = 500;

export interface RescanAllProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ scanId: string; url: string; error: string }>;
}

export function useRescanAll() {
  const [isRescanning, setIsRescanning] = useState(false);
  const [progress, setProgress] = useState<RescanAllProgress | null>(null);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const rescanAll = useCallback(
    async (scans: ScanResponse[]): Promise<RescanAllProgress> => {
      const terminal = scans.filter((s) =>
        TERMINAL_STATUSES.includes(s.status)
      );
      const prog: RescanAllProgress = {
        total: terminal.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };
      cancelledRef.current = false;
      setIsRescanning(true);
      setProgress(prog);

      for (let i = 0; i < terminal.length; i++) {
        if (cancelledRef.current) break;
        const scan = terminal[i];
        try {
          await rescanScan(scan.id);
          prog.succeeded++;
        } catch (err) {
          prog.failed++;
          prog.errors.push({
            scanId: scan.id,
            url: scan.url,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        prog.completed = i + 1;
        setProgress({ ...prog });
        if (i < terminal.length - 1) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      }
      prog.skipped = scans.length - terminal.length;
      setIsRescanning(false);
      setProgress(prog);
      return prog;
    },
    []
  );

  return {
    isRescanning,
    progress,
    rescanAll,
    cancel,
  };
}
