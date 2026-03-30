"use client";

import { INTERVAL_OPTIONS } from "@/shared/constants/monitor";

interface MonitorIntervalSelectProps {
  value: number;
  onChange: (v: number) => void;
  id?: string;
  disabled?: boolean;
}

export function MonitorIntervalSelect({
  value,
  onChange,
  id = "monitor-interval",
  disabled,
}: MonitorIntervalSelectProps) {
  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex min-h-11 w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
    >
      {INTERVAL_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
