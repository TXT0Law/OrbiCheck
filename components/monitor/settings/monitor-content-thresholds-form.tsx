"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";
import type { ContentThresholds } from "@/shared/types/monitor";

interface MonitorContentThresholdsFormProps {
  value: ContentThresholds;
  onChange: (v: ContentThresholds) => void;
}

function selectorsToText(sel: ContentThresholds["selectorExtraction"]): string {
  if (!sel?.selectors?.length) return "";
  return sel.selectors.join("\n");
}

export function MonitorContentThresholdsForm({ value, onChange }: MonitorContentThresholdsFormProps) {
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);
  const [selectorText, setSelectorText] = useState(() => selectorsToText(value.selectorExtraction));

  useEffect(() => {
    setSelectorText(selectorsToText(value.selectorExtraction));
  }, [JSON.stringify(value.selectorExtraction?.selectors ?? [])]);

  const normalizeOn = value.normalizeVolatileTokens !== false;
  const suppressDegradedOn = value.suppressDegradedPageChanges !== false;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t.settingsIntervalProductNote}</p>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={value.alertOnChange}
          onChange={(e) => onChange({ ...value, alertOnChange: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>{t.settingsAlertOnHashChange}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          {t.settingsMinChangeBytesLabel}
        </span>
        <Input
          inputMode="numeric"
          placeholder={t.settingsMinChangeBytesPlaceholder}
          value={value.minChangeSizeBytes ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              minChangeSizeBytes: raw === "" ? null : Number(raw) || 0,
            });
          }}
        />
        <span className="text-xs text-muted-foreground">{t.settingsMinChangeBytesHint}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">
          {t.settingsMinTotalDiffLinesLabel}
        </span>
        <Input
          inputMode="numeric"
          placeholder="Empty = disabled"
          value={value.minTotalDiffLines ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              minTotalDiffLines: raw === "" ? null : Number(raw) || 0,
            });
          }}
        />
        <span className="text-xs text-muted-foreground">{t.settingsMinTotalDiffLinesHint}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">{t.settingsDedupWindowLabel}</span>
        <Input
          inputMode="numeric"
          placeholder="Empty = server default"
          value={value.dedupWindowSeconds ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              dedupWindowSeconds: raw === "" ? null : Number(raw) || 0,
            });
          }}
        />
        <span className="text-xs text-muted-foreground">{t.settingsDedupWindowHint}</span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={Boolean(value.alertOnlyMediumOrLarge)}
          onChange={(e) => onChange({ ...value, alertOnlyMediumOrLarge: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>{t.settingsAlertMediumLargeOnlyLabel}</span>
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.settingsAlertMediumLargeOnlyHint}</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">{t.settingsRepeatAlertMaxLabel}</span>
        <Input
          inputMode="numeric"
          placeholder="Empty = disabled"
          value={value.repeatAlertMaxNotificationsPerFingerprint ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              repeatAlertMaxNotificationsPerFingerprint:
                raw === "" ? null : Number(raw) || null,
            });
          }}
        />
        <span className="text-xs text-muted-foreground">{t.settingsRepeatAlertMaxHint}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-white">{t.settingsRepeatAlertWindowLabel}</span>
        <Input
          inputMode="numeric"
          placeholder="Empty = disabled"
          value={value.repeatAlertFingerprintWindowMinutes ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              repeatAlertFingerprintWindowMinutes: raw === "" ? null : Number(raw) || null,
            });
          }}
        />
        <span className="text-xs text-muted-foreground">{t.settingsRepeatAlertWindowHint}</span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={normalizeOn}
          onChange={(e) =>
            onChange({ ...value, normalizeVolatileTokens: e.target.checked })
          }
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>{t.settingsNormalizeVolatileLabel}</span>
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.settingsNormalizationRulesHint}</p>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-900 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={suppressDegradedOn}
          onChange={(e) =>
            onChange({ ...value, suppressDegradedPageChanges: e.target.checked })
          }
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 dark:border-zinc-500"
        />
        <span>{t.settingsSuppressDegradedLabel}</span>
      </label>
      <details className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {t.settingsSelectorAdvancedTitle}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.settingsSelectorAdvancedHint}</p>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-white">{t.settingsSelectorListLabel}</span>
          <textarea
            className="min-h-[88px] rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder={t.settingsSelectorListPlaceholder}
            value={selectorText}
            onChange={(e) => {
              const next = e.target.value;
              setSelectorText(next);
              const lines = next
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              if (lines.length === 0) {
                onChange({ ...value, selectorExtraction: null });
              } else {
                onChange({
                  ...value,
                  selectorExtraction: {
                    selectors: lines,
                    mergeStrategy: "concat_ordered",
                  },
                });
              }
            }}
          />
        </label>
      </details>
    </div>
  );
}
