"use client";

import type { AlertContentMessages } from "@/lib/i18n/alert-content";
import type { MonitorCapability } from "@/shared/types/monitor";

export type AlertStatusFilter = "all" | "unacknowledged" | "acknowledged" | "suppressed";

export interface AlertFilterValue {
  severity: "all" | "info" | "warning" | "critical";
  capability: "all" | MonitorCapability;
  status: AlertStatusFilter;
}

interface AlertFiltersProps {
  value: AlertFilterValue;
  messages: AlertContentMessages;
  onChange: (value: AlertFilterValue) => void;
}

const SELECT_CLASS_NAME =
  "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function AlertFilters({ value, messages, onChange }: AlertFiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-end">
      <label className="flex flex-1 flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {messages.severityLabel}
        </span>
        <select
          aria-label={messages.severityLabel}
          className={SELECT_CLASS_NAME}
          value={value.severity}
          onChange={(event) => onChange({ ...value, severity: event.target.value as AlertFilterValue["severity"] })}
        >
          <option value="all">{messages.severityAll}</option>
          <option value="info">{messages.severityInfo}</option>
          <option value="warning">{messages.severityWarning}</option>
          <option value="critical">{messages.severityCritical}</option>
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {messages.capabilityLabel}
        </span>
        <select
          aria-label={messages.capabilityLabel}
          className={SELECT_CLASS_NAME}
          value={value.capability}
          onChange={(event) => onChange({ ...value, capability: event.target.value as AlertFilterValue["capability"] })}
        >
          <option value="all">{messages.capabilityAll}</option>
          <option value="uptime_only">{messages.capabilityMap.uptime_only}</option>
          <option value="content_change">{messages.capabilityMap.content_change}</option>
          <option value="ssl_expiry">{messages.capabilityMap.ssl_expiry}</option>
          <option value="visual_change">{messages.capabilityMap.visual_change}</option>
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{messages.statusLabel}</span>
        <select
          aria-label={messages.statusLabel}
          className={SELECT_CLASS_NAME}
          value={value.status}
          onChange={(event) => onChange({ ...value, status: event.target.value as AlertStatusFilter })}
        >
          <option value="all">{messages.statusAll}</option>
          <option value="unacknowledged">{messages.statusUnacknowledged}</option>
          <option value="acknowledged">{messages.statusAcknowledged}</option>
          <option value="suppressed">{messages.statusSuppressed}</option>
        </select>
      </label>
    </div>
  );
}
