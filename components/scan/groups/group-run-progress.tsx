"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UrlGroupRun, UrlGroupRunMemberStatus } from "@/types/url-group";

interface GroupRunProgressProps {
  run: UrlGroupRun;
  onCancel: (runId: string) => void;
  onRetryFailed: (runId: string) => void;
  isCancelling?: boolean;
  isRetrying?: boolean;
}

const ACTIVE_RUN_STATUSES = ["pending", "running"];
const RETRYABLE_RUN_STATUSES = ["failed", "partial"];

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

function renderRunBadge(run: UrlGroupRun) {
  if (run.status === "completed") {
    return <Badge variant="secondary">Completed</Badge>;
  }
  if (run.status === "partial") {
    return <Badge variant="outline">Partial</Badge>;
  }
  if (run.status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  if (run.status === "cancelled") {
    return <Badge variant="outline">Cancelled</Badge>;
  }
  return <Badge>Running</Badge>;
}

function renderMemberBadge(status: UrlGroupRunMemberStatus) {
  if (status === "completed") return <Badge variant="secondary">Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  if (status === "skipped") return <Badge variant="outline">Skipped</Badge>;
  return <Badge>{statusLabel(status)}</Badge>;
}

function getRunIcon(run: UrlGroupRun) {
  if (run.status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (run.status === "failed" || run.status === "partial") {
    return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  }
  if (run.status === "cancelled") {
    return <XCircle className="h-4 w-4 text-zinc-500" />;
  }
  return <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />;
}

export function GroupRunProgress({
  run,
  onCancel,
  onRetryFailed,
  isCancelling = false,
  isRetrying = false,
}: GroupRunProgressProps) {
  const isActive = ACTIVE_RUN_STATUSES.includes(run.status);
  const canRetry = RETRYABLE_RUN_STATUSES.includes(run.status) && run.failedMembers > 0;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {getRunIcon(run)}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Group scan progress
              </p>
              {renderRunBadge(run)}
            </div>
            <p className="text-xs text-muted-foreground">
              {run.completedMembers} completed, {run.failedMembers} failed,{" "}
              {run.skippedMembers} skipped, {run.cancelledMembers} cancelled
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(run.id)}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling..." : "Cancel"}
            </Button>
          )}
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetryFailed(run.id)}
              disabled={isRetrying}
            >
              {isRetrying ? "Retrying..." : "Retry failed"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Progress value={run.progress} />
        <p className="mt-1 text-xs text-muted-foreground">
          {run.progress}% complete · {run.runningMembers} running ·{" "}
          {run.queuedMembers} queued
        </p>
      </div>

      {run.members.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          {run.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 border-b border-zinc-200 px-3 py-2 text-sm last:border-b-0 dark:border-zinc-800"
            >
              <div className="min-w-0 flex-1">
                {member.scanId ? (
                  <Link
                    href={`/dashboard/scan/${member.scanId}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {member.url}
                  </Link>
                ) : (
                  <p className="truncate font-medium">{member.url}</p>
                )}
                {member.errorMessage && (
                  <p className="truncate text-xs text-red-600 dark:text-red-400">
                    {member.errorMessage}
                  </p>
                )}
              </div>
              {renderMemberBadge(member.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
