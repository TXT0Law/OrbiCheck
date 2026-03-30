"use client";

import Link from "next/link";
import { Globe, Play, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UrlGroupMember } from "@/types/url-group";

interface GroupMemberRowProps {
  member: UrlGroupMember;
  groupId: string;
  onRemove: (memberId: string) => void;
  onScanNow: (url: string) => void;
  onRescan?: (scanId: string) => void;
  isRemoving?: boolean;
  isRescanning?: boolean;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function renderStatus(status: string) {
  if (status === "completed") return <Badge variant="secondary">Completed</Badge>;
  if (status === "running" || status === "pending")
    return <Badge variant="default">Running</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Not Scanned</Badge>;
}

/** Show 100% when completed, "-" otherwise. Matches flat list scan card. */
function getProgressDisplay(status: string): string {
  return status === "completed" ? "100%" : "-";
}

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

export function GroupMemberRow({
  member,
  groupId,
  onRemove,
  onScanNow,
  onRescan,
  isRemoving = false,
  isRescanning = false,
}: GroupMemberRowProps) {
  const hasScan = !!member.scanId;
  const domain = getDomain(member.url);
  const displayName = member.displayLabel ?? domain;
  const canRescan =
    hasScan &&
    member.scanId &&
    onRescan &&
    TERMINAL_STATUSES.includes(member.status);
  const isRunning = member.status === "running" || member.status === "pending";

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
      data-group-id={groupId}
    >
      <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {hasScan ? (
          <Link
            href={`/dashboard/scan/${member.scanId}`}
            className="block truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            {displayName}
          </Link>
        ) : (
          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
            {displayName}
          </p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {member.url}
        </p>
      </div>

      <div className="hidden text-sm text-muted-foreground md:block">
        {getProgressDisplay(member.status)}
      </div>
      <div className="hidden text-sm text-muted-foreground md:block">
        Security {member.securityScore ?? "-"}
      </div>
      {renderStatus(member.status)}

      <div className="flex items-center gap-2">
        {member.status === "incomplete" ? (
          <Button
            onClick={() => onScanNow(member.url)}
            disabled={isRemoving}
            className="h-8 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
          >
            <Play className="mr-1 h-3 w-3" />
            Scan
          </Button>
        ) : canRescan ? (
          <Button
            onClick={() => onRescan(member.scanId!)}
            disabled={isRescanning || isRemoving}
            className="h-8 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {isRescanning ? "Rescanning..." : "Rescan"}
          </Button>
        ) : hasScan && isRunning ? (
          <Button
            disabled
            className="h-8 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Rescan
          </Button>
        ) : null}
        <Button
          onClick={() => onRemove(member.id)}
          disabled={isRemoving}
          className="h-8 bg-red-600 px-3 text-xs text-white hover:bg-red-700"
        >
          {isRemoving ? "Removing..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}
