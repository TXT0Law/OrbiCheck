"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Folder, MoreHorizontal, Play } from "lucide-react";

import { AddMemberDialog } from "@/components/scan/groups/add-member-dialog";
import { GroupMemberRow } from "@/components/scan/groups/group-member-row";
import { GroupRunProgress } from "@/components/scan/groups/group-run-progress";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { UrlGroup } from "@/types/url-group";
import { createScan } from "@/lib/api/scans";
import {
  useCancelGroupRun,
  useCreateGroupRun,
  useDeleteGroup,
  useGroupRunProgress,
  useGroupRuns,
  useRemoveGroupMember,
  useRetryFailedGroupRun,
  useUrlGroup,
} from "@/lib/hooks/use-url-groups";
import { useRescan } from "@/lib/hooks/use-scan-list";

const ACTIVE_GROUP_RUN_STATUSES = ["pending", "running"];

interface GroupCardProps {
  group: UrlGroup;
  onEdit: (group: UrlGroup) => void;
  /** When set, filter members by URL/domain match. */
  searchTerm?: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function GroupCard({
  group,
  onEdit,
  searchTerm = "",
}: GroupCardProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const { data: detail, isLoading } = useUrlGroup(isOpen ? group.id : "");
  const { data: runsData } = useGroupRuns(group.id, 0, 5);
  const { mutate: deleteGroup } = useDeleteGroup();
  const { mutate: removeMember, isPending: isRemoving } =
    useRemoveGroupMember(group.id);
  const { mutate: rescan, isPending: isRescanning } = useRescan();
  const { mutate: createGroupRun, isPending: isCreatingGroupRun } =
    useCreateGroupRun(group.id);
  const { mutate: cancelGroupRun, isPending: isCancellingGroupRun } =
    useCancelGroupRun(group.id);
  const { mutate: retryFailedGroupRun, isPending: isRetryingGroupRun } =
    useRetryFailedGroupRun(group.id);

  const latestRun = runsData?.runs?.[0] ?? null;
  const liveRun = useGroupRunProgress(
    group.id,
    latestRun?.id ?? "",
    !!latestRun && ACTIVE_GROUP_RUN_STATUSES.includes(latestRun.status)
  );
  const displayedRun = liveRun ?? latestRun;
  const hasActiveRun =
    !!displayedRun && ACTIVE_GROUP_RUN_STATUSES.includes(displayedRun.status);
  const memberCountForActions = detail?.members.length ?? group.memberCount;

  const memberCountLabel =
    group.memberCount === 1 ? "1 URL" : `${group.memberCount} URLs`;

  async function handleScanNow(url: string) {
    setScanError(null);
    try {
      await createScan(url);
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["url-groups", group.id] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setScanError(`Failed to start scan: ${msg}`);
    }
  }

  function handleRescan(scanId: string) {
    rescan(
      { scanId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["scans"] });
          queryClient.invalidateQueries({ queryKey: ["url-groups", group.id] });
        },
        onError: (error) => {
          const msg = error instanceof Error ? error.message : String(error);
          setScanError(`Rescan failed: ${msg}`);
        },
      }
    );
  }

  function handleDelete() {
    if (window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) {
      deleteGroup(group.id);
    }
  }

  function handleScanGroup() {
    setScanError(null);
    createGroupRun(
      { concurrencyLimit: 3 },
      {
        onSuccess: () => {
          setIsOpen(true);
          queryClient.invalidateQueries({ queryKey: ["url-group-runs", group.id] });
          queryClient.invalidateQueries({ queryKey: ["url-groups", group.id] });
        },
        onError: (error) => {
          const msg = error instanceof Error ? error.message : String(error);
          setScanError(`Group scan failed to start: ${msg}`);
        },
      }
    );
  }

  function handleCancelGroupRun(runId: string) {
    cancelGroupRun(runId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["url-group-runs", group.id] });
      },
      onError: (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        setScanError(`Group scan cancel failed: ${msg}`);
      },
    });
  }

  function handleRetryFailed(runId: string) {
    retryFailedGroupRun(
      { runId, input: { concurrencyLimit: 3 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["url-group-runs", group.id] });
        },
        onError: (error) => {
          const msg = error instanceof Error ? error.message : String(error);
          setScanError(`Retry failed members failed: ${msg}`);
        },
      }
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="space-y-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {group.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {memberCountLabel}
              </p>
            </div>
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleScanGroup}
                disabled={
                  isCreatingGroupRun ||
                  hasActiveRun ||
                  memberCountForActions === 0
                }
                className="gap-1.5"
              >
                <Play className="h-4 w-4" />
                {isCreatingGroupRun ? "Starting..." : "Scan Group"}
              </Button>
              <AddMemberDialog groupId={group.id} groupName={group.name} />
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onEdit(group)}>
                    Edit Group
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete}>
                    <span className="text-red-600 dark:text-red-400">
                      Delete Group
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-7 space-y-2">
            {scanError && (
              <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                {scanError}
              </p>
            )}
            {displayedRun && (
              <GroupRunProgress
                run={displayedRun}
                onCancel={handleCancelGroupRun}
                onRetryFailed={handleRetryFailed}
                isCancelling={isCancellingGroupRun}
                isRetrying={isRetryingGroupRun}
              />
            )}
            {isLoading ? (
              <>
                <Skeleton className="h-[52px] w-full rounded-md" />
                <Skeleton className="h-[52px] w-full rounded-md" />
              </>
            ) : !detail?.members?.length ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-muted-foreground dark:border-zinc-700">
                No URLs in this group yet
              </p>
            ) : (() => {
              const term = searchTerm.trim().toLowerCase();
              const members = term
                ? detail.members.filter((m) => {
                    const url = m.url.toLowerCase();
                    const domain = getDomain(m.url).toLowerCase();
                    const label = (m.displayLabel ?? "").toLowerCase();
                    return (
                      url.includes(term) ||
                      domain.includes(term) ||
                      label.includes(term)
                    );
                  })
                : detail.members;
              return members.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-muted-foreground dark:border-zinc-700">
                  No URLs match your search.
                </p>
              ) : (
                members.map((member) => (
                <GroupMemberRow
                  key={member.id}
                  member={member}
                  groupId={group.id}
                  onRemove={(id) => removeMember(id)}
                  onScanNow={handleScanNow}
                  onRescan={handleRescan}
                  isRemoving={isRemoving}
                  isRescanning={isRescanning}
                />
              ))
              );
            })()}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
