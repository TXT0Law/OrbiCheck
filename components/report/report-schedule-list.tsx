"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ReportScheduleDialog } from "@/components/report/report-schedule-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  useDeleteReportSchedule,
  useRunReportScheduleNow,
  useUpdateReportSchedule,
} from "@/lib/hooks/use-report-schedules";
import type { ReportSchedule, ReportScheduleRunStatus } from "@/shared/types/report";

interface ReportScheduleListProps {
  schedules: ReportSchedule[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatCadence(schedule: ReportSchedule): string {
  const time = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  if (schedule.cadence === "weekly") {
    return `${WEEKDAYS[schedule.dayOfWeek ?? 0]} ${time}`;
  }
  return `Day ${schedule.dayOfMonth ?? 1} ${time}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function runStatusVariant(status: ReportScheduleRunStatus | undefined) {
  if (status === "completed") return "success";
  if (status === "failed") return "destructive";
  if (status === "generating" || status === "delivering") return "info";
  return "secondary";
}

export function ReportScheduleList({ schedules }: ReportScheduleListProps) {
  const { toast } = useToast();
  const updateSchedule = useUpdateReportSchedule();
  const deleteSchedule = useDeleteReportSchedule();
  const runNow = useRunReportScheduleNow();
  const [editing, setEditing] = useState<ReportSchedule | null>(null);
  const [deleting, setDeleting] = useState<ReportSchedule | null>(null);

  async function handleToggle(schedule: ReportSchedule) {
    try {
      await updateSchedule.mutateAsync({
        id: schedule.id,
        payload: { isEnabled: !schedule.isEnabled },
      });
      toast({
        title: schedule.isEnabled ? "Schedule paused" : "Schedule resumed",
        description: `"${schedule.name}" was updated.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update schedule.";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    }
  }

  async function handleRunNow(schedule: ReportSchedule) {
    try {
      await runNow.mutateAsync(schedule.id);
      toast({
        title: "Run queued",
        description: `"${schedule.name}" is generating a report now.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run schedule.";
      toast({ title: "Run failed", description: message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteSchedule.mutateAsync(deleting.id);
      toast({ title: "Schedule deleted", description: `"${deleting.name}" was removed.` });
      setDeleting(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete schedule.";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    }
  }

  if (!schedules.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">No schedules yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Create a weekly or monthly schedule to generate reports automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Next run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => {
              const lastRun = schedule.recentRuns[0];
              return (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>
                    <div>{formatCadence(schedule)}</div>
                    <div className="text-xs text-muted-foreground">{schedule.timezone}</div>
                  </TableCell>
                  <TableCell className="capitalize">{schedule.format}</TableCell>
                  <TableCell>
                    {schedule.deliveryChannels.length
                      ? schedule.deliveryChannels.join(", ")
                      : "Store only"}
                  </TableCell>
                  <TableCell>{formatDate(schedule.lastRunAt)}</TableCell>
                  <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={schedule.isEnabled ? "success" : "secondary"}>
                        {schedule.isEnabled ? "enabled" : "paused"}
                      </Badge>
                      {lastRun ? (
                        <Badge variant={runStatusVariant(lastRun.status)}>
                          {lastRun.status}
                        </Badge>
                      ) : null}
                      {lastRun?.deliverySummary &&
                      lastRun.status === "failed" ? (
                        <span className="text-xs text-red-600">Delivery needs attention</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(schedule)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleToggle(schedule)}
                        disabled={updateSchedule.isPending}
                      >
                        {schedule.isEnabled ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRunNow(schedule)}
                        disabled={runNow.isPending || !schedule.scanId}
                      >
                        Run now
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleting(schedule)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ReportScheduleDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        schedule={editing}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete Schedule"
        description={`Delete "${deleting?.name ?? "this schedule"}" and its run history?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
        isLoading={deleteSchedule.isPending}
      />
    </>
  );
}
