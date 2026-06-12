"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ReportScheduleDialog } from "@/components/report/report-schedule-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import {
  useDeleteReportSchedule,
  useRunReportScheduleNow,
  useUpdateReportSchedule,
} from "@/lib/hooks/use-report-schedules";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import type { ReportSchedule, ReportScheduleRunStatus } from "@/shared/types/report";

interface ReportScheduleListProps {
  schedules: ReportSchedule[];
}

function formatCadence(
  schedule: ReportSchedule,
  messages: ReturnType<typeof getDashboardMessages>["reports"],
): string {
  const time = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  if (schedule.cadence === "weekly") {
    return `${messages.weekDays[schedule.dayOfWeek ?? 0]} ${time}`;
  }
  return `${messages.dayOfMonth(schedule.dayOfMonth ?? 1)} ${time}`;
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

function getRunStatusLabel(
  status: ReportScheduleRunStatus,
  messages: ReturnType<typeof getDashboardMessages>["reports"],
) {
  if (status === "completed") return messages.statusCompleted;
  if (status === "failed") return messages.statusFailed;
  if (status === "generating") return messages.statusGenerating;
  if (status === "delivering") return messages.statusDelivering;
  return messages.statusPending;
}

export function ReportScheduleList({ schedules }: ReportScheduleListProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).reports;
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
        title: schedule.isEnabled ? messages.schedulePausedTitle : messages.scheduleResumedTitle,
        description: messages.scheduleUpdatedDescription(schedule.name),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.updateScheduleFallback;
      toast({ title: messages.updateFailedTitle, description: message, variant: "destructive" });
    }
  }

  async function handleRunNow(schedule: ReportSchedule) {
    try {
      await runNow.mutateAsync(schedule.id);
      toast({
        title: messages.runQueuedTitle,
        description: messages.runQueuedDescription(schedule.name),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.runScheduleFallback;
      toast({ title: messages.runFailedTitle, description: message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteSchedule.mutateAsync(deleting.id);
      toast({
        title: messages.scheduleDeletedTitle,
        description: messages.scheduleDeletedDescription(deleting.name),
      });
      setDeleting(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.deleteScheduleFallback;
      toast({ title: messages.deleteFailedTitle, description: message, variant: "destructive" });
    }
  }

  if (!schedules.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{messages.noSchedulesTitle}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {messages.noSchedulesDescription}
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
              <TableHead>{messages.scheduleTableName}</TableHead>
              <TableHead>{messages.scheduleTableCadence}</TableHead>
              <TableHead>{messages.scheduleTableFormat}</TableHead>
              <TableHead>{messages.scheduleTableDelivery}</TableHead>
              <TableHead>{messages.scheduleTableLastRun}</TableHead>
              <TableHead>{messages.scheduleTableNextRun}</TableHead>
              <TableHead>{messages.scheduleTableStatus}</TableHead>
              <TableHead className="text-right">{messages.scheduleTableActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => {
              const lastRun = schedule.recentRuns[0];
              return (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>
                    <div>{formatCadence(schedule, messages)}</div>
                    <div className="text-xs text-muted-foreground">{schedule.timezone}</div>
                  </TableCell>
                  <TableCell className="capitalize">{schedule.format}</TableCell>
                  <TableCell>
                    {schedule.deliveryChannels.length
                      ? schedule.deliveryChannels.join(", ")
                      : messages.storeOnly}
                  </TableCell>
                  <TableCell>{formatDate(schedule.lastRunAt)}</TableCell>
                  <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={schedule.isEnabled ? "success" : "secondary"}>
                        {schedule.isEnabled ? messages.scheduleEnabledStatus : messages.schedulePausedStatus}
                      </Badge>
                      {lastRun ? (
                        <Badge variant={runStatusVariant(lastRun.status)}>
                          {getRunStatusLabel(lastRun.status, messages)}
                        </Badge>
                      ) : null}
                      {lastRun?.deliverySummary &&
                      lastRun.status === "failed" ? (
                        <span className="text-xs text-red-600">
                          {messages.deliveryNeedsAttention}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(schedule)}>
                        {messages.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleToggle(schedule)}
                        disabled={updateSchedule.isPending}
                      >
                        {schedule.isEnabled ? messages.pause : messages.resume}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRunNow(schedule)}
                        disabled={runNow.isPending || !schedule.scanId}
                      >
                        {messages.runNow}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleting(schedule)}>
                        {messages.deleteScheduleTitle}
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
        title={messages.deleteScheduleTitle}
        description={messages.deleteScheduleDescription(deleting?.name ?? messages.thisSchedule)}
        confirmLabel={messages.deleteScheduleTitle}
        cancelLabel={messages.cancel}
        loadingLabel={messages.pleaseWait}
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
        isLoading={deleteSchedule.isPending}
      />
    </>
  );
}
