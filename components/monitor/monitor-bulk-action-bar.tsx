"use client";

import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useBulkActOnMonitors } from "@/lib/hooks/use-monitors";
import { useMonitorStore } from "@/lib/stores/monitor-store";
import {
  MONITOR_BULK_MAX_IDS,
  type MonitorBulkAction,
} from "@/shared/schemas/monitor";

interface MonitorBulkActionBarProps {
  /** Ids that are present in the current page; used to clamp selection to visible rows. */
  visibleMonitorIds: string[];
}

const ACTION_LABEL: Record<MonitorBulkAction, string> = {
  pause: "Pause",
  resume: "Resume",
  enable: "Enable",
  disable: "Disable",
  delete: "Delete",
};

const ACTION_PAST: Record<MonitorBulkAction, string> = {
  pause: "paused",
  resume: "resumed",
  enable: "enabled",
  disable: "disabled",
  delete: "deleted",
};

export function MonitorBulkActionBar({ visibleMonitorIds }: MonitorBulkActionBarProps) {
  const selectedIds = useMonitorStore((s) => s.selectedMonitorIds);
  const clearMonitorSelection = useMonitorStore((s) => s.clearMonitorSelection);
  const { toast } = useToast();
  const bulkMutation = useBulkActOnMonitors();
  const [pendingDelete, setPendingDelete] = useState(false);

  // Only act on ids currently visible — paginating away should not silently
  // mutate hidden monitors that the user may no longer remember selecting.
  const visibleSet = useMemo(() => new Set(visibleMonitorIds), [visibleMonitorIds]);
  const actionableIds = useMemo(
    () => selectedIds.filter((id) => visibleSet.has(id)),
    [selectedIds, visibleSet],
  );
  const count = actionableIds.length;

  if (count === 0) return null;

  async function runAction(action: MonitorBulkAction) {
    if (actionableIds.length === 0) return;
    if (actionableIds.length > MONITOR_BULK_MAX_IDS) {
      toast({
        title: "Selection too large",
        description: `Bulk actions accept at most ${MONITOR_BULK_MAX_IDS} monitors at a time.`,
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await bulkMutation.mutateAsync({
        action,
        monitorIds: actionableIds,
      });
      const succeeded = res.succeeded.length;
      const failed = res.failed.length;
      if (failed === 0) {
        toast({
          title: `${succeeded} monitor${succeeded === 1 ? "" : "s"} ${ACTION_PAST[action]}`,
        });
      } else {
        toast({
          title: `${succeeded} ${ACTION_PAST[action]}, ${failed} failed`,
          description: res.failed
            .slice(0, 3)
            .map((f) => f.message)
            .join(" · "),
          variant: failed === res.requested ? "destructive" : undefined,
        });
      }
      clearMonitorSelection();
    } catch (err) {
      toast({
        title: "Bulk action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        className="sticky top-2 z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-800 dark:bg-blue-950/40"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
            {count} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={clearMonitorSelection}
            disabled={bulkMutation.isPending}
          >
            Clear selection
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runAction("pause")}
            disabled={bulkMutation.isPending}
          >
            {ACTION_LABEL.pause}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runAction("resume")}
            disabled={bulkMutation.isPending}
          >
            {ACTION_LABEL.resume}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runAction("enable")}
            disabled={bulkMutation.isPending}
          >
            {ACTION_LABEL.enable}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runAction("disable")}
            disabled={bulkMutation.isPending}
          >
            {ACTION_LABEL.disable}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingDelete(true)}
            disabled={bulkMutation.isPending}
          >
            {ACTION_LABEL.delete}
          </Button>
        </div>
      </div>

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} monitor{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected monitors and their check
              history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setPendingDelete(false);
                await runAction("delete");
              }}
              disabled={bulkMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
