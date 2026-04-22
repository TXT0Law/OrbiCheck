"use client";

import { Input } from "@/components/ui/input";
import {
  MONITOR_DNS_RECORD_TYPES,
  MONITOR_MAX_DNS_NAMESERVERS,
  type DnsThresholds,
  type MonitorDnsRecordType,
} from "@/shared/types/monitor";

interface MonitorDnsThresholdsFormProps {
  value: DnsThresholds;
  onChange: (v: DnsThresholds) => void;
}

export function MonitorDnsThresholdsForm({
  value,
  onChange,
}: MonitorDnsThresholdsFormProps) {
  function toggleRecordType(t: MonitorDnsRecordType, on: boolean) {
    const set = new Set(value.recordTypes);
    if (on) {
      set.add(t);
    } else {
      set.delete(t);
    }
    onChange({ ...value, recordTypes: Array.from(set) });
  }

  function updateNameservers(raw: string) {
    const items = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MONITOR_MAX_DNS_NAMESERVERS);
    onChange({ ...value, nameservers: items });
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-900 dark:text-white">
          Record types
        </legend>
        <div className="flex flex-wrap gap-2">
          {MONITOR_DNS_RECORD_TYPES.map((t) => {
            const checked = value.recordTypes.includes(t);
            return (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleRecordType(t, e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-400"
                />
                {t}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          Custom nameservers
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Comma- or space-separated IPs. Empty = system resolver. Max{" "}
          {MONITOR_MAX_DNS_NAMESERVERS}.
        </span>
        <Input
          placeholder="1.1.1.1, 8.8.8.8"
          value={value.nameservers.join(", ")}
          onChange={(e) => updateNameservers(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          Query timeout (seconds)
        </span>
        <Input
          type="number"
          min={1}
          max={60}
          value={value.queryTimeoutSeconds}
          onChange={(e) =>
            onChange({
              ...value,
              queryTimeoutSeconds: Math.max(
                1,
                Math.min(60, Number(e.target.value) || 1),
              ),
            })
          }
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={value.alertOnChange}
          onChange={(e) =>
            onChange({ ...value, alertOnChange: e.target.checked })
          }
          className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>Alert when records change</span>
      </label>
    </div>
  );
}
