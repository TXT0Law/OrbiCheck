"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UrlGroup } from "@/types/url-group";
import { useUpdateGroup } from "@/lib/hooks/use-url-groups";

interface EditGroupDialogProps {
  group: UrlGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditGroupDialog({
  group,
  open,
  onOpenChange,
}: EditGroupDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { mutate: updateGroup, isPending, error } = useUpdateGroup(
    group?.id ?? ""
  );

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description ?? "");
    }
  }, [group]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !name.trim()) return;
    updateGroup(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  }

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="edit-group-name"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Name *
            </label>
            <Input
              id="edit-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              maxLength={255}
              required
              disabled={isPending}
            />
          </div>
          <div>
            <label
              htmlFor="edit-group-desc"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Description (optional)
            </label>
            <Textarea
              id="edit-group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              maxLength={2000}
              rows={3}
              disabled={isPending}
              className="resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : "Failed to update group"}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
