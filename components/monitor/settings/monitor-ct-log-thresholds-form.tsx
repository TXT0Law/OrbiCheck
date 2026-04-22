"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MONITOR_MAX_CT_PINNED_SERIALS,
  type CtLogThresholds,
} from "@/shared/types/monitor";

interface MonitorCtLogThresholdsFormProps {
  value: CtLogThresholds;
  onChange: (v: CtLogThresholds) => void;
}

export function MonitorCtLogThresholdsForm({
  value,
  onChange,
}: MonitorCtLogThresholdsFormProps) {
  function updatePinned(raw: string) {
    const items = raw
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, MONITOR_MAX_CT_PINNED_SERIALS);
    onChange({ ...value, pinnedSerials: items });
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          Pinned certificate serials
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Lower-case hex serials. crt.sh entries with non-pinned serials
          trigger alerts. Empty = no pinning. Max{" "}
          {MONITOR_MAX_CT_PINNED_SERIALS}.
        </span>
        <Textarea
          rows={3}
          placeholder="0a1b2c3d…, 0123abcd…"
          value={value.pinnedSerials.join(", ")}
          onChange={(e) => updatePinned(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          Lookback window (hours)
        </span>
        <Input
          type="number"
          min={1}
          max={720}
          value={value.lookbackHours}
          onChange={(e) =>
            onChange({
              ...value,
              lookbackHours: Math.max(
                1,
                Math.min(720, Number(e.target.value) || 1),
              ),
            })
          }
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={value.alertOnNewEntry}
          onChange={(e) =>
            onChange({ ...value, alertOnNewEntry: e.target.checked })
          }
          className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>Alert on new CT log entry</span>
      </label>
    </div>
  );
}
