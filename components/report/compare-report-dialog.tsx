"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScanDomainTimeline } from "@/lib/hooks/use-scan-trend";
import type { ReportListItem } from "@/shared/types/report";

interface CompareReportDialogProps {
  /** The originating report whose ``scanId`` becomes the diff base. */
  report: ReportListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Phase 5 / T5.2 — opens from the Reports list "Compare" button.
 *
 * Lists the most recent terminal scans of the same domain (excluding the
 * report's own scan), lets the user pick a target, then routes to the
 * scan-to-scan diff page with both IDs in the query string.
 */
export function CompareReportDialog({
  report,
  open,
  onOpenChange,
}: CompareReportDialogProps) {
  const router = useRouter();
  const domain = report?.scanDomain ?? undefined;
  const baseScanId = report?.scanId ?? undefined;

  const timelineQuery = useScanDomainTimeline(open ? domain : undefined, {
    range: "all",
    limit: 50,
  });

  const candidates = useMemo(() => {
    const points = timelineQuery.data?.points ?? [];
    if (!baseScanId) return [];
    return points.filter((p) => p.scanId !== baseScanId);
  }, [baseScanId, timelineQuery.data?.points]);

  const [selectedCompareId, setSelectedCompareId] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedCompareId("");
      return;
    }
    if (!selectedCompareId && candidates[0]) {
      setSelectedCompareId(candidates[0].scanId);
    }
  }, [open, selectedCompareId, candidates]);

  function handleSubmit() {
    if (!baseScanId || !selectedCompareId) return;
    const url = `/dashboard/scan/diff?baseId=${encodeURIComponent(
      baseScanId,
    )}&compareId=${encodeURIComponent(selectedCompareId)}`;
    onOpenChange(false);
    router.push(url);
  }

  const errorMessage =
    timelineQuery.error instanceof Error
      ? timelineQuery.error.message
      : timelineQuery.error
        ? "Failed to load comparable scans."
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Compare scans</DialogTitle>
          <DialogDescription>
            Pick a scan of the same domain to diff against{" "}
            <span className="font-medium">
              {report?.scanDomain ?? "this report"}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {!baseScanId ? (
          <p className="text-sm text-muted-foreground">
            The original scan for this report has been deleted, so a diff is no
            longer possible.
          </p>
        ) : timelineQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading comparable scans…</p>
        ) : errorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          >
            {errorMessage}
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No other completed scans of <code>{domain}</code> found yet. Run another
            scan of this domain first to enable comparison.
          </p>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="compare-scan"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Compare against
            </label>
            <select
              id="compare-scan"
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              value={selectedCompareId}
              onChange={(event) => setSelectedCompareId(event.target.value)}
            >
              {candidates.map((point) => {
                const date = point.completedAt
                  ? new Date(point.completedAt).toLocaleString()
                  : "Unknown date";
                const scoreSuffix =
                  point.securityScore !== null
                    ? ` — score ${point.securityScore}`
                    : "";
                return (
                  <option key={point.scanId} value={point.scanId}>
                    {date}
                    {scoreSuffix}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!baseScanId || !selectedCompareId}
          >
            View diff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
