"use client";

import { useMonitorPeriod, type MonitorPeriod } from "@/lib/hooks/use-monitor-period";

const OPTIONS: { value: MonitorPeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export function MonitorTimeRangePicker() {
  const { period, setPeriod } = useMonitorPeriod();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Range</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setPeriod(o.value)}
          className={`min-h-10 min-w-[3.25rem] rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
            period === o.value
              ? "bg-sky-600 text-white shadow-md dark:bg-sky-500"
              : "border-2 border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
