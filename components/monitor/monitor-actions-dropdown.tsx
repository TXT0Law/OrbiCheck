"use client";

import { useState } from "react";
import { Loader2, MoreVertical, Pause, Play, Settings, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  useDeleteMonitor,
  useToggleMonitor,
  useTriggerCheck,
} from "@/lib/hooks/use-monitors";
import type { Monitor } from "@/shared/types/monitor";

interface MonitorActionsDropdownProps {
  monitor: Monitor;
}

export function MonitorActionsDropdown({ monitor }: MonitorActionsDropdownProps) {
  const router = useRouter();
  const { toast } = useToast();
  const toggleMonitor = useToggleMonitor();
  const deleteMonitor = useDeleteMonitor();
  const triggerCheck = useTriggerCheck(monitor.id);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const isAnyPending =
    toggleMonitor.isPending || deleteMonitor.isPending || triggerCheck.isPending;

  /** Running if not paused and not explicitly disabled (undefined isEnabled => treat as on). */
  const isMonitorActive =
    monitor.status !== "paused" && monitor.isEnabled !== false;

  async function handleToggle() {
    const newEnabled = !isMonitorActive;
    try {
      await toggleMonitor.mutateAsync({
        id: monitor.id,
        enabled: newEnabled,
      });
      toast({
        title: newEnabled ? "Monitor continued" : "Monitor paused",
        description: newEnabled
          ? "Checks will resume at the configured interval."
          : "Checks are paused. No data will be collected.",
      });
    } catch {
      toast({
        title: "Action failed",
        description: `Could not ${newEnabled ? "continue" : "pause"} the monitor.`,
        variant: "destructive",
      });
    }
  }

  async function handleCheckNow() {
    try {
      await triggerCheck.mutateAsync();
      toast({
        title: "Check triggered",
        description: "A manual check has been queued.",
      });
    } catch {
      toast({
        title: "Check failed",
        description: "Could not trigger a manual check.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    try {
      await deleteMonitor.mutateAsync(monitor.id);
      toast({
        title: "Monitor deleted",
        description: `"${monitor.displayName}" and all its history have been removed.`,
      });
      router.push("/dashboard/monitor");
    } catch {
      toast({
        title: "Delete failed",
        description: "Could not delete the monitor. Please try again.",
        variant: "destructive",
      });
    }
    setShowDeleteDialog(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-zinc-300 bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Monitor actions"
          >
            {isAnyPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <MoreVertical className="h-5 w-5" />
            )}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={triggerCheck.isPending || !isMonitorActive}
            onClick={() => void handleCheckNow()}
          >
            <Zap className="mr-2 h-4 w-4" />
            Check Now
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={toggleMonitor.isPending}
            onClick={() => void handleToggle()}
          >
            {isMonitorActive ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause Monitor
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Continue Monitor
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/dashboard/monitor/${monitor.id}/settings`)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={deleteMonitor.isPending}
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4 text-red-600" />
            <span className="text-red-600">Delete Monitor</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Monitor"
        description={`Are you sure you want to delete "${monitor.displayName}"? This will permanently remove all check history, snapshots, and change records.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
        isLoading={deleteMonitor.isPending}
      />
    </>
  );
}
