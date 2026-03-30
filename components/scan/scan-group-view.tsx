"use client";

import { useMemo } from "react";
import { Folder } from "lucide-react";

import { CreateGroupDialog } from "@/components/scan/groups/create-group-dialog";
import { GroupCard } from "@/components/scan/groups/group-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { UrlGroup } from "@/types/url-group";
import type { ScanListSortBy } from "@/lib/api/scans";
import { useUrlGroups } from "@/lib/hooks/use-url-groups";

interface ScanGroupViewProps {
  onEdit: (group: UrlGroup) => void;
  /** Search term for filtering groups (by name) and member URLs. */
  searchTerm?: string;
  /** Sort order for groups. */
  sortBy?: ScanListSortBy;
}

function filterAndSortGroups(
  groups: UrlGroup[],
  searchTerm: string,
  sortBy: ScanListSortBy
): UrlGroup[] {
  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? groups.filter((g) => g.name.toLowerCase().includes(term))
    : [...groups];

  return filtered.sort((a, b) => {
    switch (sortBy) {
      case "created_at_desc":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "created_at_asc":
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case "domain_asc":
        return a.name.localeCompare(b.name);
      case "domain_desc":
        return b.name.localeCompare(a.name);
      case "security_score_desc":
      case "progress_desc":
        return b.memberCount - a.memberCount;
      case "security_score_asc":
        return a.memberCount - b.memberCount;
      default:
        return 0;
    }
  });
}

export function ScanGroupView({
  onEdit,
  searchTerm = "",
  sortBy = "created_at_desc",
}: ScanGroupViewProps) {
  const { data, isLoading, error } = useUrlGroups(0, 100);

  const displayedGroups = useMemo(() => {
    const raw = data?.groups ?? [];
    return filterAndSortGroups(raw, searchTerm, sortBy);
  }, [data?.groups, searchTerm, sortBy]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        {error instanceof Error ? error.message : "Failed to load groups"}
      </div>
    );
  }

  if (displayedGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 p-12 dark:border-zinc-700">
        <Folder className="h-12 w-12 text-zinc-400" />
        <p className="mt-3 text-sm text-muted-foreground">
          {searchTerm.trim()
            ? "No groups match your search."
            : "No groups found"}
        </p>
        {!searchTerm.trim() && <CreateGroupDialog />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayedGroups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          onEdit={onEdit}
          searchTerm={searchTerm}
        />
      ))}
    </div>
  );
}
