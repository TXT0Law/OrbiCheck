"use client";

import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";

export type ChangeSizeFilter = "all" | "small" | "medium" | "large";

interface MonitorChangeFilterProps {
  sizeFilter: ChangeSizeFilter;
  onSizeFilterChange: (v: ChangeSizeFilter) => void;
}

export function MonitorChangeFilter({ sizeFilter, onSizeFilterChange }: MonitorChangeFilterProps) {
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium">{t.filterLabel}</span>
      <select
        value={sizeFilter}
        onChange={(e) => onSizeFilterChange(e.target.value as ChangeSizeFilter)}
        className="h-9 rounded-md border-2 border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <option value="all">{t.filterAll}</option>
        <option value="small">{t.filterSmall}</option>
        <option value="medium">{t.filterMedium}</option>
        <option value="large">{t.filterLarge}</option>
      </select>
    </label>
  );
}
