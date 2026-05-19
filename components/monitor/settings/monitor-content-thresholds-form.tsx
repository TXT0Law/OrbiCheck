"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";
import {
  CONTENT_FETCH_MODES,
  MONITOR_BROWSER_FETCH_MIN_INTERVAL_SECONDS,
  type ContentFetchMode,
  type ContentFetchOptions,
  type ContentThresholds,
} from "@/shared/types/monitor";

interface MonitorContentThresholdsFormProps {
  value: ContentThresholds;
  onChange: (v: ContentThresholds) => void;
}

function selectorsToText(sel: ContentThresholds["selectorExtraction"]): string {
  if (!sel?.selectors?.length) return "";
  return sel.selectors.join("\n");
}

function extractorsToText(extractors: ContentThresholds["extractors"]): string {
  if (!extractors?.length) return "";
  return extractors.map((item) => `${item.type}:${item.expression}`).join("\n");
}

function textToExtractors(raw: string): NonNullable<ContentThresholds["extractors"]> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      const type = line.slice(0, idx).trim();
      const expression = line.slice(idx + 1).trim();
      if (!["css", "xpath", "jsonpath"].includes(type) || !expression) return null;
      return { type: type as "css" | "xpath" | "jsonpath", expression };
    })
    .filter((item): item is NonNullable<ContentThresholds["extractors"]>[number] => item !== null);
}

// C-3: word lists round-trip through a single textarea — one entry per line
// with empty / whitespace-only lines filtered out so paste-in lists stay
// painless to edit.
function wordsToText(words: ContentThresholds["triggerWords"] | ContentThresholds["ignoreWords"]): string {
  if (!Array.isArray(words) || words.length === 0) return "";
  return words.join("\n");
}

function textToWords(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// C-5: parse the four fetchOptions inputs back into a ContentFetchOptions
// object. Empty inputs become `null` so the JSONB stays compact.
function emptyOrNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function emptyOrString(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function fetchOptionsHasAnyValue(options: ContentFetchOptions | null | undefined): boolean {
  if (!options) return false;
  return (
    options.waitForSelector != null ||
    options.waitMs != null ||
    options.viewportWidth != null ||
    options.viewportHeight != null
  );
}

function setFetchOption<K extends keyof ContentFetchOptions>(
  options: ContentFetchOptions | null | undefined,
  key: K,
  next: ContentFetchOptions[K] | null,
): ContentFetchOptions | null {
  const merged: ContentFetchOptions = { ...(options ?? {}) };
  if (next == null) {
    delete (merged as Record<string, unknown>)[key as string];
  } else {
    (merged as Record<string, unknown>)[key as string] = next as unknown;
  }
  return fetchOptionsHasAnyValue(merged) ? merged : null;
}

export function MonitorContentThresholdsForm({ value, onChange }: MonitorContentThresholdsFormProps) {
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);
  const selectorTextValue = useMemo(
    () => selectorsToText(value.selectorExtraction),
    [value.selectorExtraction],
  );
  const extractorTextValue = useMemo(
    () => extractorsToText(value.extractors),
    [value.extractors],
  );
  const restockOutTextValue = useMemo(
    () => wordsToText(value.restock?.outOfStockKeywords),
    [value.restock?.outOfStockKeywords],
  );
  const restockInTextValue = useMemo(
    () => wordsToText(value.restock?.inStockKeywords),
    [value.restock?.inStockKeywords],
  );
  const triggerWordsTextValue = useMemo(
    () => wordsToText(value.triggerWords),
    [value.triggerWords],
  );
  const ignoreWordsTextValue = useMemo(
    () => wordsToText(value.ignoreWords),
    [value.ignoreWords],
  );
  const [selectorText, setSelectorText] = useState(selectorTextValue);
  const [extractorText, setExtractorText] = useState(extractorTextValue);
  const [restockOutText, setRestockOutText] = useState(restockOutTextValue);
  const [restockInText, setRestockInText] = useState(restockInTextValue);

  useEffect(() => {
    setSelectorText(selectorTextValue);
  }, [selectorTextValue]);
  useEffect(() => {
    setExtractorText(extractorTextValue);
  }, [extractorTextValue]);
  useEffect(() => {
    setRestockOutText(restockOutTextValue);
  }, [restockOutTextValue]);
  useEffect(() => {
    setRestockInText(restockInTextValue);
  }, [restockInTextValue]);

  const normalizeOn = value.normalizeVolatileTokens !== false;
  const suppressDegradedOn = value.suppressDegradedPageChanges !== false;
  const selectorCount = value.selectorExtraction?.selectors?.length ?? 0;
  // C-3: textarea state mirrors the existing selector pattern (see the
  // selectorText useEffect above). Tracking the raw string locally keeps
  // the editor cursor stable while the user types — replacing the array
  // on every keystroke would re-render the textarea.
  const [triggerWordsText, setTriggerWordsText] = useState(triggerWordsTextValue);
  const [ignoreWordsText, setIgnoreWordsText] = useState(ignoreWordsTextValue);
  useEffect(() => {
    setTriggerWordsText(triggerWordsTextValue);
  }, [triggerWordsTextValue]);
  useEffect(() => {
    setIgnoreWordsText(ignoreWordsTextValue);
  }, [ignoreWordsTextValue]);

  // C-5: keep "browser" only when explicitly set; default selector falls back
  // to "http" so legacy monitors render the existing UI on first open.
  const fetchMode: ContentFetchMode = value.fetchMode === "browser" ? "browser" : "http";
  const fetchOptions = value.fetchOptions ?? null;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t.settingsIntervalProductNote}</p>

      {/*
        C-1: Selector scoping is now first-class because it is the single
        most effective way to cut content_change noise on dynamic pages.
        The old "<details>" advanced block was hiding the field from new
        users who never realised they could opt-in.
      */}
      <section className="rounded-md border border-purple-200 bg-purple-50/40 p-3 dark:border-purple-900/40 dark:bg-purple-950/20">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {t.settingsSelectorListLabel}
          </span>
          {selectorCount > 0 ? (
            <span className="text-[11px] font-medium uppercase tracking-wide text-purple-700 dark:text-purple-200">
              {selectorCount} active
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t.settingsSelectorAdvancedHint}
        </p>
        <textarea
          className="mt-3 min-h-[88px] w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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
      </section>

      <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer font-medium text-zinc-900 dark:text-white">
          XPath / JSONPath extractors and restock
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              One extractor per line: css:main h1, xpath://article//h1, jsonpath:$.items[*].title
            </span>
            <textarea
              className="min-h-[72px] w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              value={extractorText}
              onChange={(e) => {
                const next = e.target.value;
                setExtractorText(next);
                const extractors = textToExtractors(next);
                onChange({ ...value, extractors: extractors.length ? extractors : null });
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(value.restock?.enabled)}
              onChange={(e) =>
                onChange({
                  ...value,
                  restock: {
                    enabled: e.target.checked,
                    outOfStockKeywords: value.restock?.outOfStockKeywords ?? [],
                    inStockKeywords: value.restock?.inStockKeywords ?? [],
                  },
                })
              }
              className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
            />
            <span>Detect restock / in-stock transitions</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-zinc-900 dark:text-white">Out-of-stock words</span>
              <textarea
                className="min-h-[68px] rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={restockOutText}
                onChange={(e) => {
                  const next = e.target.value;
                  setRestockOutText(next);
                  onChange({
                    ...value,
                    restock: {
                      enabled: Boolean(value.restock?.enabled),
                      outOfStockKeywords: textToWords(next),
                      inStockKeywords: value.restock?.inStockKeywords ?? [],
                    },
                  });
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-zinc-900 dark:text-white">In-stock words</span>
              <textarea
                className="min-h-[68px] rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                value={restockInText}
                onChange={(e) => {
                  const next = e.target.value;
                  setRestockInText(next);
                  onChange({
                    ...value,
                    restock: {
                      enabled: Boolean(value.restock?.enabled),
                      outOfStockKeywords: value.restock?.outOfStockKeywords ?? [],
                      inStockKeywords: textToWords(next),
                    },
                  });
                }}
              />
            </label>
          </div>
        </div>
      </details>

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

      {/*
        C-3: trigger / ignore words and triggerRegex sit in their own
        advanced block so simple monitors stay one screen tall. The backend
        treats missing keys as "no constraint" — sending null when the
        textarea is empty keeps the JSONB compact.
      */}
      <details
        className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
        data-testid="content-trigger-words-section"
      >
        <summary className="cursor-pointer font-medium text-zinc-900 dark:text-white">
          {t.settingsTriggerWordsLabel}
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t.settingsTriggerWordsHint}</span>
            <textarea
              data-testid="content-trigger-words-input"
              className="min-h-[68px] w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder={t.settingsTriggerWordsPlaceholder}
              value={triggerWordsText}
              onChange={(e) => {
                const next = e.target.value;
                setTriggerWordsText(next);
                const words = textToWords(next);
                onChange({ ...value, triggerWords: words.length === 0 ? null : words });
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-900 dark:text-white">
              {t.settingsIgnoreWordsLabel}
            </span>
            <span className="text-xs text-muted-foreground">{t.settingsIgnoreWordsHint}</span>
            <textarea
              data-testid="content-ignore-words-input"
              className="min-h-[68px] w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder={t.settingsIgnoreWordsPlaceholder}
              value={ignoreWordsText}
              onChange={(e) => {
                const next = e.target.value;
                setIgnoreWordsText(next);
                const words = textToWords(next);
                onChange({ ...value, ignoreWords: words.length === 0 ? null : words });
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-900 dark:text-white">
              {t.settingsTriggerRegexLabel}
            </span>
            <span className="text-xs text-muted-foreground">{t.settingsTriggerRegexHint}</span>
            <Input
              data-testid="content-trigger-regex-input"
              placeholder={t.settingsTriggerRegexPlaceholder}
              value={value.triggerRegex ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ ...value, triggerRegex: raw.trim() === "" ? null : raw });
              }}
            />
          </label>
        </div>
      </details>

      {/*
        C-5: fetch mode (HTTP vs browser) lives at the top of an advanced
        section so it's visible without unfolding when the operator clicks
        "Browser fetch options". The select is intentionally a native
        <select> to match the visual hash algorithm picker on the visual
        thresholds form.
      */}
      <section
        className="rounded-md border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-sky-950/20"
        data-testid="content-fetch-mode-section"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-900 dark:text-white">
            {t.settingsFetchModeLabel}
          </span>
          <span className="text-xs text-muted-foreground">{t.settingsFetchModeHint}</span>
          <select
            data-testid="content-fetch-mode-select"
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            value={fetchMode}
            onChange={(e) => {
              const next = e.target.value as ContentFetchMode;
              onChange({
                ...value,
                fetchMode: next,
                // Drop fetchOptions when switching back to HTTP so the
                // payload doesn't ship orphaned config the server would
                // ignore anyway.
                fetchOptions: next === "browser" ? value.fetchOptions ?? null : null,
              });
            }}
          >
            {CONTENT_FETCH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === "http" ? t.settingsFetchModeHttp : t.settingsFetchModeBrowser}
              </option>
            ))}
          </select>
        </label>

        {fetchMode === "browser" && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" data-testid="content-fetch-browser-min-interval-note">
            {t.settingsFetchModeBrowserMinIntervalNote.replace(
              "300",
              String(MONITOR_BROWSER_FETCH_MIN_INTERVAL_SECONDS),
            )}
          </p>
        )}

        {fetchMode === "browser" && (
          <details
            className="mt-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            data-testid="content-fetch-options-details"
          >
            <summary className="cursor-pointer font-medium text-zinc-900 dark:text-white">
              {t.settingsFetchOptionsTitle}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.settingsFetchOptionsHint}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-zinc-900 dark:text-white">
                  {t.settingsFetchWaitForSelectorLabel}
                </span>
                <Input
                  data-testid="content-fetch-wait-for-selector"
                  placeholder="main h1"
                  value={fetchOptions?.waitForSelector ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      fetchOptions: setFetchOption(
                        fetchOptions,
                        "waitForSelector",
                        emptyOrString(e.target.value),
                      ),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-900 dark:text-white">
                  {t.settingsFetchWaitMsLabel}
                </span>
                <Input
                  inputMode="numeric"
                  data-testid="content-fetch-wait-ms"
                  placeholder="0 – 10000"
                  value={fetchOptions?.waitMs ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      fetchOptions: setFetchOption(
                        fetchOptions,
                        "waitMs",
                        emptyOrNumber(e.target.value),
                      ),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-900 dark:text-white">
                  {t.settingsFetchViewportWidthLabel}
                </span>
                <Input
                  inputMode="numeric"
                  data-testid="content-fetch-viewport-width"
                  placeholder="1280"
                  value={fetchOptions?.viewportWidth ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      fetchOptions: setFetchOption(
                        fetchOptions,
                        "viewportWidth",
                        emptyOrNumber(e.target.value),
                      ),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-900 dark:text-white">
                  {t.settingsFetchViewportHeightLabel}
                </span>
                <Input
                  inputMode="numeric"
                  data-testid="content-fetch-viewport-height"
                  placeholder="720"
                  value={fetchOptions?.viewportHeight ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      fetchOptions: setFetchOption(
                        fetchOptions,
                        "viewportHeight",
                        emptyOrNumber(e.target.value),
                      ),
                    })
                  }
                />
              </label>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
