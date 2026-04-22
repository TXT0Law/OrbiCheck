"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { MaintenanceWindowForm } from "@/components/settings/maintenance-window-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  useCreateMaintenanceWindow,
  useDeleteMaintenanceWindow,
  useMaintenanceWindows,
  useUpdateMaintenanceWindow,
} from "@/lib/hooks/use-maintenance-windows";
import type {
  MaintenanceWindow,
  MaintenanceRecurrenceSpec,
} from "@/shared/types/monitor";

function formatRange(window: MaintenanceWindow): string {
  const start = new Date(window.startsAt);
  const end = new Date(window.endsAt);
  return `${start.toLocaleString()} → ${end.toLocaleString()}`;
}

function describeRecurrence(rec: MaintenanceRecurrenceSpec | null): string {
  if (!rec) return "One-shot";
  if (rec.freq === "daily") return "Daily";
  const days = rec.byWeekday ?? [];
  if (days.length === 0) return "Weekly (any day)";
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `Weekly · ${days.map((d) => labels[d] ?? `?${d}`).join(", ")}`;
}

export default function MaintenanceSettingsPage() {
  const list = useMaintenanceWindows({ includeDisabled: true });
  const createWindow = useCreateMaintenanceWindow();
  const updateWindow = useUpdateMaintenanceWindow();
  const deleteWindow = useDeleteMaintenanceWindow();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceWindow | null>(null);

  const sorted = useMemo(() => {
    if (!list.data) return [];
    return [...list.data].sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  }, [list.data]);

  function startCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function startEdit(window: MaintenanceWindow) {
    setEditing(window);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function handleSubmit(payload: unknown) {
    try {
      if (editing) {
        await updateWindow.mutateAsync({
          id: editing.id,
          payload: payload as never,
        });
        toast({ title: "Maintenance window updated" });
      } else {
        await createWindow.mutateAsync(payload as never);
        toast({ title: "Maintenance window created" });
      }
      cancelForm();
    } catch (err) {
      toast({
        title: editing ? "Update failed" : "Create failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      throw err;
    }
  }

  async function handleDelete(window: MaintenanceWindow) {
    if (!confirm(`Delete "${window.title}"? This cannot be undone.`)) return;
    try {
      await deleteWindow.mutateAsync(window.id);
      toast({ title: "Maintenance window deleted" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const busy =
    createWindow.isPending ||
    updateWindow.isPending ||
    deleteWindow.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Maintenance Windows
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suppress alerts (and optionally probes) during planned
            maintenance. Windows can repeat daily/weekly and target specific
            tags.
          </p>
        </div>
        {!showForm ? (
          <Button onClick={startCreate}>
            <Plus className="mr-1 h-4 w-4" /> New window
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {editing ? "Edit maintenance window" : "New maintenance window"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MaintenanceWindowForm
              mode={editing ? "edit" : "create"}
              initial={editing ?? undefined}
              onSubmit={handleSubmit}
              onCancel={cancelForm}
              busy={busy}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing windows</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : list.isError ? (
            <p className="text-sm text-muted-foreground">
              Failed to load maintenance windows.
            </p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No maintenance windows configured yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((window) => (
                <li
                  key={window.id}
                  className={`rounded-md border p-3 text-sm ${
                    window.isEnabled
                      ? "border-zinc-200 dark:border-zinc-800"
                      : "border-zinc-200 bg-zinc-50/40 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {window.title}
                        </span>
                        {!window.isEnabled ? (
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                            Disabled
                          </span>
                        ) : null}
                        {window.suppressProbes ? (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                            Skips probes
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatRange(window)} · {describeRecurrence(window.recurrence)}
                      </p>
                      {window.monitorId ? (
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Monitor: <span className="font-mono">{window.monitorId}</span>
                        </p>
                      ) : null}
                      {window.tagScope && window.tagScope.length > 0 ? (
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Tags:{" "}
                          {window.tagScope.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                            >
                              {t}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {window.notes ? (
                        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                          {window.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(window)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(window)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
