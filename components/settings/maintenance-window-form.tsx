"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  maintenanceWindowCreateSchema,
  maintenanceWindowUpdateSchema,
  type MaintenanceWindowCreateInput,
  type MaintenanceWindowUpdateInput,
} from "@/shared/schemas/monitor";
import type {
  MaintenanceRecurrenceFreq,
  MaintenanceRecurrenceSpec,
  MaintenanceWindow,
} from "@/shared/types/monitor";

const WEEKDAYS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

interface MaintenanceWindowFormProps {
  initial?: MaintenanceWindow;
  onSubmit: (
    payload: MaintenanceWindowCreateInput | MaintenanceWindowUpdateInput,
  ) => Promise<unknown>;
  onCancel?: () => void;
  busy?: boolean;
  /** Switch between "create" and "edit" semantics for validation/labels. */
  mode: "create" | "edit";
}

interface FormState {
  title: string;
  monitorId: string;
  startsAt: string;
  endsAt: string;
  suppressAlerts: boolean;
  suppressProbes: boolean;
  isEnabled: boolean;
  notes: string;
  recurrenceEnabled: boolean;
  recurrenceFreq: MaintenanceRecurrenceFreq;
  recurrenceWeekdays: number[];
  recurrenceUntil: string;
  tagScopeRaw: string;
}

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:mm" without TZ.
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function fromLocalDatetimeInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return d.toISOString();
}

function buildInitialState(initial?: MaintenanceWindow): FormState {
  const rec = initial?.recurrence ?? null;
  return {
    title: initial?.title ?? "",
    monitorId: initial?.monitorId ?? "",
    startsAt: toLocalDatetimeInput(initial?.startsAt ?? null),
    endsAt: toLocalDatetimeInput(initial?.endsAt ?? null),
    suppressAlerts: initial?.suppressAlerts ?? true,
    suppressProbes: initial?.suppressProbes ?? false,
    isEnabled: initial?.isEnabled ?? true,
    notes: initial?.notes ?? "",
    recurrenceEnabled: Boolean(rec),
    recurrenceFreq: rec?.freq ?? "weekly",
    recurrenceWeekdays: rec?.byWeekday ?? [],
    recurrenceUntil: toLocalDatetimeInput(rec?.untilAt ?? null),
    tagScopeRaw: (initial?.tagScope ?? []).join(", "),
  };
}

export function MaintenanceWindowForm({
  initial,
  onSubmit,
  onCancel,
  busy,
  mode,
}: MaintenanceWindowFormProps) {
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(initial),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(buildInitialState(initial));
  }, [initial]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWeekday(day: number) {
    setState((prev) => {
      const set = new Set(prev.recurrenceWeekdays);
      if (set.has(day)) {
        set.delete(day);
      } else {
        set.add(day);
      }
      return { ...prev, recurrenceWeekdays: Array.from(set).sort((a, b) => a - b) };
    });
  }

  const tagScope = useMemo(() => {
    return state.tagScopeRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [state.tagScopeRaw]);

  const recurrence: MaintenanceRecurrenceSpec | null = useMemo(() => {
    if (!state.recurrenceEnabled) return null;
    return {
      freq: state.recurrenceFreq,
      byWeekday:
        state.recurrenceFreq === "weekly" && state.recurrenceWeekdays.length > 0
          ? state.recurrenceWeekdays
          : null,
      untilAt: state.recurrenceUntil
        ? fromLocalDatetimeInput(state.recurrenceUntil)
        : null,
    };
  }, [
    state.recurrenceEnabled,
    state.recurrenceFreq,
    state.recurrenceWeekdays,
    state.recurrenceUntil,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payloadBase = {
      title: state.title.trim(),
      monitorId: state.monitorId.trim() || null,
      startsAt: fromLocalDatetimeInput(state.startsAt),
      endsAt: fromLocalDatetimeInput(state.endsAt),
      suppressAlerts: state.suppressAlerts,
      suppressProbes: state.suppressProbes,
      isEnabled: state.isEnabled,
      notes: state.notes.trim() || null,
      recurrence,
      tagScope: tagScope.length > 0 ? tagScope : null,
    };

    try {
      if (mode === "create") {
        const parsed = maintenanceWindowCreateSchema.parse(payloadBase);
        await onSubmit(parsed);
      } else {
        const parsed = maintenanceWindowUpdateSchema.parse({
          ...payloadBase,
          // Edit-mode tells the API explicitly when the user emptied a field.
          clearRecurrence: recurrence === null,
          clearTagScope: tagScope.length === 0,
          clearMonitorScope: !payloadBase.monitorId,
        });
        await onSubmit(parsed);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to save maintenance window");
      }
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">Title</span>
        <Input
          required
          maxLength={120}
          value={state.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="Quarterly DB upgrade"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-white">
            Starts at
          </span>
          <Input
            type="datetime-local"
            required
            value={state.startsAt}
            onChange={(e) => patch("startsAt", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-white">
            Ends at
          </span>
          <Input
            type="datetime-local"
            required
            value={state.endsAt}
            onChange={(e) => patch("endsAt", e.target.value)}
          />
        </label>
      </div>

      <fieldset className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm font-medium text-zinc-900 dark:text-white">
          Suppression
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={state.suppressAlerts}
            onChange={(e) => patch("suppressAlerts", e.target.checked)}
            className="h-4 w-4 rounded border-zinc-400"
          />
          Suppress alert dispatch
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={state.suppressProbes}
            onChange={(e) => patch("suppressProbes", e.target.checked)}
            className="h-4 w-4 rounded border-zinc-400"
          />
          Skip probes entirely (no checks scheduled)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={state.isEnabled}
            onChange={(e) => patch("isEnabled", e.target.checked)}
            className="h-4 w-4 rounded border-zinc-400"
          />
          Window is enabled
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <legend className="px-1 text-sm font-medium text-zinc-900 dark:text-white">
          Recurrence
        </legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={state.recurrenceEnabled}
            onChange={(e) => patch("recurrenceEnabled", e.target.checked)}
            className="h-4 w-4 rounded border-zinc-400"
          />
          Repeat this window
        </label>

        {state.recurrenceEnabled ? (
          <>
            <div className="flex gap-3 text-sm">
              {(["daily", "weekly"] as const).map((freq) => (
                <label
                  key={freq}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="radio"
                    name="recurrence-freq"
                    value={freq}
                    checked={state.recurrenceFreq === freq}
                    onChange={() => patch("recurrenceFreq", freq)}
                  />
                  {freq === "daily" ? "Daily" : "Weekly"}
                </label>
              ))}
            </div>

            {state.recurrenceFreq === "weekly" ? (
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const checked = state.recurrenceWeekdays.includes(d.value);
                  return (
                    <label
                      key={d.value}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                        checked
                          ? "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-500 dark:bg-zinc-800 dark:text-white"
                          : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWeekday(d.value)}
                        className="h-3.5 w-3.5 rounded border-zinc-400"
                      />
                      {d.label}
                    </label>
                  );
                })}
              </div>
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-900 dark:text-white">
                Until (optional)
              </span>
              <Input
                type="datetime-local"
                value={state.recurrenceUntil}
                onChange={(e) => patch("recurrenceUntil", e.target.value)}
              />
            </label>
          </>
        ) : null}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          Tag scope (optional)
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Comma-separated tags. When set, only monitors with at least one
          matching tag are affected. Empty = all monitors of this user.
        </span>
        <Input
          placeholder="prod, customer-facing"
          value={state.tagScopeRaw}
          onChange={(e) => patch("tagScopeRaw", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          Monitor scope (optional)
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Limit this window to a single monitor by UUID. Leave blank to apply
          across the user (subject to tag scope).
        </span>
        <Input
          placeholder="UUID, leave blank for all monitors"
          value={state.monitorId}
          onChange={(e) => patch("monitorId", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">Notes</span>
        <Textarea
          maxLength={500}
          rows={3}
          value={state.notes}
          onChange={(e) => patch("notes", e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : mode === "create"
              ? "Create window"
              : "Save changes"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
