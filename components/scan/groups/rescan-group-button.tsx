"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useRescanAll } from "@/lib/hooks/use-rescan-all";
import { getGroupMembers } from "@/lib/api/url-groups";
import type { ScanResponse } from "@/shared/types/api";
import type { UrlGroupMember } from "@/types/url-group";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

interface RescanGroupButtonProps {
  groupId: string;
  onComplete?: () => void;
  disabled?: boolean;
}

function memberToScanLike(m: UrlGroupMember): ScanResponse | null {
  if (!m.scanId || !TERMINAL_STATUSES.includes(m.status)) return null;
  let domain = m.url;
  try {
    domain = new URL(m.url).hostname;
  } catch {
    // keep m.url
  }
  return {
    id: m.scanId,
    url: m.url,
    domain,
    status: m.status as ScanResponse["status"],
    progress: m.status === "completed" ? 100 : 0,
    totalModules: 0,
    completedModules: 0,
    securityScore: m.securityScore,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: "",
  };
}

export function RescanGroupButton({
  groupId,
  onComplete,
  disabled = false,
}: RescanGroupButtonProps) {
  const { isRescanning, progress, rescanAll, cancel } = useRescanAll();
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (progress && progress.completed === progress.total && !isRescanning) {
      setShowSummary(true);
      const t = setTimeout(() => setShowSummary(false), 2000);
      return () => clearTimeout(t);
    }
  }, [progress, isRescanning]);

  async function handleClick() {
    const members = await getGroupMembers(groupId);
    const scans = members
      .map(memberToScanLike)
      .filter((s): s is ScanResponse => s !== null);
    if (scans.length === 0) return;
    await rescanAll(scans);
    onComplete?.();
  }

  const isDisabled = disabled || isRescanning;

  if (progress && progress.completed < progress.total && isRescanning) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-[80px]">
          <Progress
            value={
              progress.total > 0
                ? (progress.completed / progress.total) * 100
                : 0
            }
          />
          <p className="text-xs text-muted-foreground">
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
      <p className="text-xs text-muted-foreground">
        ✓ {progress.succeeded} rescanned
        {progress.failed > 0 ? ` • ${progress.failed} failed` : ""}
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
      Rescan Group
    </Button>
  );
}
