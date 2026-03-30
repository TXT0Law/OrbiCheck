"use client";

import { Input } from "@/components/ui/input";
import type { UptimeThresholds } from "@/shared/types/monitor";

interface MonitorUptimeThresholdsFormProps {
  value: UptimeThresholds;
  onChange: (v: UptimeThresholds) => void;
}

export function MonitorUptimeThresholdsForm({ value, onChange }: MonitorUptimeThresholdsFormProps) {
  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">Max response time (ms)</span>
        <Input
          inputMode="numeric"
          placeholder="Empty = off"
          value={value.maxResponseTimeMs ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              maxResponseTimeMs: raw === "" ? null : Number(raw) || null,
            });
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">Consecutive failures</span>
        <Input
          inputMode="numeric"
          min={1}
          max={100}
          value={value.consecutiveFailures}
          onChange={(e) =>
            onChange({ ...value, consecutiveFailures: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={value.alertOnUnexpectedStatus}
          onChange={(e) => onChange({ ...value, alertOnUnexpectedStatus: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>Alert on unexpected HTTP status</span>
      </label>
    </div>
  );
}
