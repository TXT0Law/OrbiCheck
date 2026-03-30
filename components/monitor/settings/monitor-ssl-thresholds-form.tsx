"use client";

import { Input } from "@/components/ui/input";
import type { SslThresholds } from "@/shared/types/monitor";

interface MonitorSslThresholdsFormProps {
  value: SslThresholds;
  onChange: (v: SslThresholds) => void;
}

export function MonitorSslThresholdsForm({ value, onChange }: MonitorSslThresholdsFormProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">Warn (days)</span>
        <Input
          inputMode="numeric"
          min={1}
          max={365}
          value={value.warnDaysRemaining}
          onChange={(e) =>
            onChange({ ...value, warnDaysRemaining: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">Critical (days)</span>
        <Input
          inputMode="numeric"
          min={1}
          max={90}
          value={value.criticalDaysRemaining}
          onChange={(e) =>
            onChange({
              ...value,
              criticalDaysRemaining: Math.max(1, Number(e.target.value) || 1),
            })
          }
        />
      </label>
    </div>
  );
}
