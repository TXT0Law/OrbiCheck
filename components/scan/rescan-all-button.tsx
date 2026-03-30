"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ScanResponse } from "@/shared/types/api";
import { useRescanAll } from "@/lib/hooks/use-rescan-all";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

interface RescanAllButtonProps {
  scans: ScanResponse[];
  onComplete?: () => void;
  disabled?: boolean;
}

export function RescanAllButton({
  scans,
  onComplete,
  disabled = false,
}: RescanAllButtonProps) {
  const { isRescanning, progress, rescanAll, cancel } = useRescanAll();
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (progress && progress.completed === progress.total && !isRescanning) {
      setShowSummary(true);
      const t = setTimeout(() => setShowSummary(false), 2000);
      return () => clearTimeout(t);
    }
  }, [progress, isRescanning]);

  const rescannableCount = scans.filter((s) =>
    TERMINAL_STATUSES.includes(s.status)
  ).length;

  const isDisabled =
    disabled || isRescanning || rescannableCount === 0;

  const handleClick = () => {
    const terminal = scans.filter((s) =>
      TERMINAL_STATUSES.includes(s.status)
    );
    rescanAll(terminal).then(() => {
      onComplete?.();
    });
  };

  if (progress && progress.completed < progress.total && isRescanning) {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-[120px]">
          <Progress
            value={
              progress.total > 0
                ? (progress.completed / progress.total) * 100
                : 0
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.completed}/{progress.total}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={cancel}
          disabled={!isRescanning}
        >
          Cancel
        </Button>
      </div>
    );
  }

  if (showSummary && progress && progress.completed === progress.total) {
    return (
      <p className="text-sm text-muted-foreground">
        ✓ {progress.succeeded} rescanned
        {progress.failed > 0 ? ` • ${progress.failed} failed` : ""}
        {progress.skipped > 0 ? ` • ${progress.skipped} skipped` : ""}
      </p>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isDisabled}
      className="gap-1.5"
    >
      <RotateCcw className="h-4 w-4" />
      Rescan All ({rescannableCount})
    </Button>
  );
}
