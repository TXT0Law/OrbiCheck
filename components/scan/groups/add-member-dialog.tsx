"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseAndValidateUrls } from "@/lib/utils/url-input-sanitizer";
import { useAddGroupMember } from "@/lib/hooks/use-url-groups";

const MAX_URLS = 50;

interface AddMemberDialogProps {
  groupId: string;
  groupName: string;
}

export function AddMemberDialog({
  groupId,
  groupName,
}: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const { mutateAsync: addMemberAsync, error, reset } =
    useAddGroupMember(groupId);

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setUrlInput("");
      setDisplayLabel("");
      setErrors([]);
      reset();
    }
    setOpen(newOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    const result = parseAndValidateUrls(urlInput, MAX_URLS);

    if (result.errors.length > 0) {
      setErrors(result.errors);
      return;
    }

    if (result.urls.length === 0) {
      setErrors(["Please enter at least one valid URL"]);
      return;
    }

    setIsAdding(true);
    const addErrors: string[] = [];
    for (const url of result.urls) {
      try {
        await addMemberAsync({
          url,
          displayLabel:
            result.urls.length === 1 && displayLabel.trim()
              ? displayLabel.trim()
              : undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addErrors.push(`${url}: ${msg}`);
      }
    }
    setIsAdding(false);

    if (addErrors.length > 0) {
      setErrors(addErrors);
      return;
    }

    setUrlInput("");
    setDisplayLabel("");
    setErrors([]);
    setOpen(false);
  }

  const previewCount =
    urlInput.trim().split(/[\n,]+/).filter((s) => s.trim()).length;
  const hasValidInput = urlInput.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add URL
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add URL to {groupName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="member-url"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              URL *
            </label>
            <Textarea
              id="member-url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter URLs (one per line or comma-separated)
https://example.com
https://example.org"
              rows={4}
              disabled={isAdding}
              className="font-mono resize-none text-sm"
              aria-label="URLs to add"
            />
            {previewCount > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {previewCount} URL{previewCount > 1 ? "s" : ""} detected
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="member-label"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Display label (optional, applies to single URL only)
            </label>
            <Input
              id="member-label"
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              placeholder="e.g. Homepage"
              maxLength={255}
              disabled={isAdding}
            />
          </div>
          {errors.length > 0 && (
            <ul className="list-disc space-y-1 rounded-md border border-red-300 bg-red-50 pl-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : "Failed to add URL"}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isAdding}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isAdding || !hasValidInput}
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : previewCount > 1 ? (
                `Add ${previewCount} URLs`
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
