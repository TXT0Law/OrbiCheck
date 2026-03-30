"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Folder, MoreHorizontal } from "lucide-react";

import { AddMemberDialog } from "@/components/scan/groups/add-member-dialog";
import { RescanGroupButton } from "@/components/scan/groups/rescan-group-button";
import { GroupMemberRow } from "@/components/scan/groups/group-member-row";
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
  useDeleteGroup,
  useRemoveGroupMember,
  useUrlGroup,
} from "@/lib/hooks/use-url-groups";
import { useRescan } from "@/lib/hooks/use-scan-list";

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
  const { mutate: deleteGroup } = useDeleteGroup();
  const { mutate: removeMember, isPending: isRemoving } =
    useRemoveGroupMember(group.id);
  const { mutate: rescan, isPending: isRescanning } = useRescan();

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
              <RescanGroupButton
                groupId={group.id}
                onComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ["url-groups"] });
                  queryClient.invalidateQueries({ queryKey: ["url-groups", group.id] });
                }}
              />
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
