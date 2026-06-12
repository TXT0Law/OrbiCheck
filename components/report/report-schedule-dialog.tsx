"use client";

import { useEffect, useMemo, useState } from "react";
import { ZodError } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useMonitors } from "@/lib/hooks/use-monitors";
import { useCreateReportSchedule, useUpdateReportSchedule } from "@/lib/hooks/use-report-schedules";
import { useScanList } from "@/lib/hooks/use-scan-list";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import {
  reportScheduleCreateSchema,
  reportScheduleUpdateSchema,
} from "@/shared/schemas/report";
import type {
  ReportFormat,
  ReportPeriod,
  ReportSchedule,
  ReportScheduleCadence,
  ReportScheduleDeliveryChannel,
} from "@/shared/types/report";

interface ReportScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: ReportSchedule | null;
}

interface FormState {
  name: string;
  scanId: string;
  includeMonitor: boolean;
  monitorId: string;
  monitorPeriod: ReportPeriod;
  format: ReportFormat;
  cadence: ReportScheduleCadence;
  timezone: string;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  deliverEmail: boolean;
  deliverSlack: boolean;
  emailRecipients: string;
  isEnabled: boolean;
}

const FORMAT_OPTIONS: ReportFormat[] = ["pdf", "markdown", "html", "both", "all"];
const PERIOD_OPTIONS: ReportPeriod[] = ["24h", "7d", "30d", "90d"];
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

function userTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function buildState(schedule?: ReportSchedule | null): FormState {
  return {
    name: schedule?.name ?? "",
    scanId: schedule?.scanId ?? "",
    includeMonitor: Boolean(schedule?.monitorId),
    monitorId: schedule?.monitorId ?? "",
    monitorPeriod: schedule?.monitorPeriod ?? "30d",
    format: schedule?.format ?? "pdf",
    cadence: schedule?.cadence ?? "weekly",
    timezone: schedule?.timezone ?? userTimezone(),
    dayOfWeek: schedule?.dayOfWeek ?? 0,
    dayOfMonth: schedule?.dayOfMonth ?? 1,
    hour: schedule?.hour ?? DEFAULT_HOUR,
    minute: schedule?.minute ?? DEFAULT_MINUTE,
    deliverEmail: schedule?.deliveryChannels.includes("email") ?? false,
    deliverSlack: schedule?.deliveryChannels.includes("slack") ?? false,
    emailRecipients: (schedule?.emailRecipients ?? []).join(", "),
    isEnabled: schedule?.isEnabled ?? true,
  };
}

function splitRecipients(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ReportScheduleDialog({
  open,
  onOpenChange,
  schedule,
}: ReportScheduleDialogProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).reports;
  const { toast } = useToast();
  const createSchedule = useCreateReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const scansQuery = useScanList({
    page: 1,
    size: 50,
    statusGroup: "completed",
    sortBy: "created_at_desc",
  });
  const monitorsQuery = useMonitors({ page: 1, limit: 50 });
  const scans = useMemo(() => scansQuery.data?.scans ?? [], [scansQuery.data?.scans]);
  const monitors = useMemo(() => monitorsQuery.data?.data ?? [], [monitorsQuery.data?.data]);
  const [state, setState] = useState<FormState>(() => buildState(schedule));
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(schedule);
  const isBusy = createSchedule.isPending || updateSchedule.isPending;

  useEffect(() => {
    if (open) {
      setState(buildState(schedule));
      setFormError(null);
    }
  }, [open, schedule]);

  useEffect(() => {
    if (!open || state.scanId || !scans[0] || isEditing) {
      return;
    }
    setState((prev) => ({ ...prev, scanId: scans[0].id }));
  }, [isEditing, open, scans, state.scanId]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setFormError(null);
    const deliveryChannels: ReportScheduleDeliveryChannel[] = [];
    if (state.deliverEmail) deliveryChannels.push("email");
    if (state.deliverSlack) deliveryChannels.push("slack");
    const payload = {
      name: state.name.trim(),
      scanId: state.scanId,
      monitorId: state.includeMonitor && state.monitorId ? state.monitorId : null,
      monitorPeriod: state.monitorPeriod,
      format: state.format,
      cadence: state.cadence,
      timezone: state.timezone.trim(),
      dayOfWeek: state.cadence === "weekly" ? state.dayOfWeek : null,
      dayOfMonth: state.cadence === "monthly" ? state.dayOfMonth : null,
      hour: state.hour,
      minute: state.minute,
      deliveryChannels,
      emailRecipients: splitRecipients(state.emailRecipients),
      isEnabled: state.isEnabled,
    };

    try {
      if (isEditing && schedule) {
        const parsed = reportScheduleUpdateSchema.parse(payload);
        await updateSchedule.mutateAsync({ id: schedule.id, payload: parsed });
      } else {
        const parsed = reportScheduleCreateSchema.parse(payload);
        await createSchedule.mutateAsync(parsed);
      }
      toast({
        title: isEditing ? messages.scheduleUpdatedTitle : messages.scheduleCreatedTitle,
        description: messages.scheduleReadyDescription(payload.name),
      });
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof ZodError
          ? error.issues[0]?.message ?? messages.scheduleFormFallback
          : error instanceof Error
            ? error.message
            : messages.scheduleSaveFallback;
      setFormError(message);
      toast({ title: messages.scheduleNotSavedTitle, description: message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? messages.scheduleDialogEditTitle : messages.scheduleDialogCreateTitle}
          </DialogTitle>
          <DialogDescription>
            {messages.scheduleDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {formError}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.nameLabel}</span>
              <Input value={state.name} onChange={(event) => patch("name", event.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.timezoneLabel}</span>
              <Input
                value={state.timezone}
                onChange={(event) => patch("timezone", event.target.value)}
                placeholder="UTC"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.scanLabel}</span>
              <select
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                value={state.scanId}
                onChange={(event) => patch("scanId", event.target.value)}
              >
                <option value="">{messages.selectCompletedScan}</option>
                {scans.map((scan) => (
                  <option key={scan.id} value={scan.id}>
                    {scan.domain} ({scan.createdAt.slice(0, 10)})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.formatLabel}</span>
              <select
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                value={state.format}
                onChange={(event) => patch("format", event.target.value as ReportFormat)}
              >
                {FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={state.includeMonitor}
                onChange={(event) => patch("includeMonitor", event.target.checked)}
              />
              {messages.includeMonitorSummary}
            </label>
            {state.includeMonitor ? (
              <div className="grid gap-4 md:grid-cols-2">
                <select
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  value={state.monitorId}
                  onChange={(event) => patch("monitorId", event.target.value)}
                >
                  <option value="">{messages.selectMonitor}</option>
                  {monitors.map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.displayName}
                    </option>
                  ))}
                </select>
                <select
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  value={state.monitorPeriod}
                  onChange={(event) => patch("monitorPeriod", event.target.value as ReportPeriod)}
                >
                  {PERIOD_OPTIONS.map((period) => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.cadenceLabel}</span>
              <select
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                value={state.cadence}
                onChange={(event) => patch("cadence", event.target.value as ReportScheduleCadence)}
              >
                <option value="weekly">{messages.weekly}</option>
                <option value="monthly">{messages.monthly}</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">
                {state.cadence === "weekly" ? messages.weekdayLabel : messages.dayLabel}
              </span>
              {state.cadence === "weekly" ? (
                <select
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  value={state.dayOfWeek}
                  onChange={(event) => patch("dayOfWeek", Number(event.target.value))}
                >
                  {messages.weekDays.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={state.dayOfMonth}
                  onChange={(event) => patch("dayOfMonth", Number(event.target.value))}
                />
              )}
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.hourLabel}</span>
              <Input
                type="number"
                min={0}
                max={23}
                value={state.hour}
                onChange={(event) => patch("hour", Number(event.target.value))}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{messages.minuteLabel}</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={state.minute}
                onChange={(event) => patch("minute", Number(event.target.value))}
              />
            </label>
          </div>

          <fieldset className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <legend className="px-1 text-sm font-medium">{messages.deliveryLabel}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.deliverEmail}
                onChange={(event) => patch("deliverEmail", event.target.checked)}
              />
              Email
            </label>
            {state.deliverEmail ? (
              <Input
                value={state.emailRecipients}
                onChange={(event) => patch("emailRecipients", event.target.value)}
                placeholder="security@example.com, ops@example.com"
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.deliverSlack}
                onChange={(event) => patch("deliverSlack", event.target.checked)}
              />
              {messages.slackConfiguredChannel}
            </label>
            {!state.deliverEmail && !state.deliverSlack ? (
              <p className="text-sm text-amber-600">
                {messages.noDeliveryWarning}
              </p>
            ) : null}
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.isEnabled}
              onChange={(event) => patch("isEnabled", event.target.checked)}
            />
            {messages.enabledLabel}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            {messages.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isBusy || scans.length === 0}>
            {isBusy
              ? messages.saving
              : isEditing
                ? messages.saveSchedule
                : messages.scheduleDialogCreateTitle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
