"use client";

import { useState } from "react";
import { Folder } from "lucide-react";

import { CreateGroupDialog } from "@/components/scan/groups/create-group-dialog";
import { EditGroupDialog } from "@/components/scan/groups/edit-group-dialog";
import { GroupCard } from "@/components/scan/groups/group-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { UrlGroup } from "@/types/url-group";
import { useUrlGroups } from "@/lib/hooks/use-url-groups";

export default function GroupsPage() {
  const [editingGroup, setEditingGroup] = useState<UrlGroup | null>(null);
  const { data, isLoading, error } = useUrlGroups(0, 50);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            URL Groups
          </h1>
          <p className="mt-1 text-muted-foreground">
            Organize URLs into groups for batch scanning and management.
          </p>
        </div>
        <CreateGroupDialog />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error instanceof Error ? error.message : "Failed to load groups"}
        </div>
      ) : !data?.groups?.length ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 p-12 dark:border-zinc-700">
          <Folder className="h-12 w-12 text-zinc-400" />
          <p className="mt-3 text-sm text-muted-foreground">
            No groups yet
          </p>
          <CreateGroupDialog />
        </div>
      ) : (
        <div className="space-y-3">
          {data.groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onEdit={(g) => setEditingGroup(g)}
            />
          ))}
        </div>
      )}

      <EditGroupDialog
        group={editingGroup}
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
      />
    </div>
  );
}
