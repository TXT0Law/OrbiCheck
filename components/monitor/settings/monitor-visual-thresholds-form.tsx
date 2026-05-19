"use client";

import { useEffect, useMemo, useState } from "react";

import { MonitorVisualMaskEditor } from "@/components/monitor/monitor-visual-mask-editor";
import { Input } from "@/components/ui/input";
import {
  VISUAL_HASH_ALGORITHMS,
  VISUAL_MAX_IGNORE_REGIONS,
  type VisualHashAlgorithm,
  type VisualIgnoreRegion,
  type VisualThresholds,
} from "@/shared/types/monitor";

interface MonitorVisualThresholdsFormProps {
  value: VisualThresholds;
  onChange: (v: VisualThresholds) => void;
}

const HASH_ALGORITHM_DESCRIPTIONS: Record<VisualHashAlgorithm, string> = {
  dhash: "dHash — fast, robust to small geometry shifts (default).",
  phash: "pHash — DCT-based; tolerates JPEG / WebP artefacts.",
  ahash: "aHash — cheapest; sensitive to lighting / contrast.",
  whash: "wHash — wavelet-based; most resilient but slowest.",
};

export function MonitorVisualThresholdsForm({ value, onChange }: MonitorVisualThresholdsFormProps) {
  const stepsTextValue = useMemo(
    () => (value.steps ? JSON.stringify(value.steps, null, 2) : ""),
    [value.steps],
  );
  const [stepsText, setStepsText] = useState(stepsTextValue);
  const [stepsParseError, setStepsParseError] = useState<string | null>(null);

  useEffect(() => {
    setStepsText(stepsTextValue);
    setStepsParseError(null);
  }, [stepsTextValue]);

  return (
    <div className="space-y-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-zinc-900 dark:text-white">
          Minimum similarity (%)
        </span>
        <span className="text-xs text-muted-foreground">
          When similarity to the previous capture (dHash) falls strictly below this value, a visual
          change is recorded. Typical range 88–98; default 92.
        </span>
        <Input
          inputMode="decimal"
          placeholder="92"
          value={value.similarityThresholdPercent ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              similarityThresholdPercent: raw === "" ? null : Number(raw),
            });
          }}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-zinc-900 dark:text-white">Viewport width (px)</span>
          <Input
            inputMode="numeric"
            value={value.viewportWidth ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChange({
                ...value,
                viewportWidth: raw === "" ? null : Number(raw),
              });
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-zinc-900 dark:text-white">Viewport height (px)</span>
          <Input
            inputMode="numeric"
            value={value.viewportHeight ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChange({
                ...value,
                viewportHeight: raw === "" ? null : Number(raw),
              });
            }}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="visual-full-page"
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-300"
          checked={Boolean(value.fullPage)}
          onChange={(e) =>
            onChange({
              ...value,
              fullPage: e.target.checked,
            })
          }
        />
        <label
          htmlFor="visual-full-page"
          className="font-normal text-zinc-800 dark:text-zinc-200"
        >
          Full-page screenshot (taller pages, slower / larger images)
        </label>
      </div>
      {/*
        V-1: when this is on (default), failed probes still produce a
        screenshot so operators can see what OrbiCheck saw (bot wall, 5xx,
        TLS error). The capture is marked is_diagnostic server-side and
        never participates in dHash similarity comparison.
      */}
      <div className="flex items-start gap-2">
        <input
          id="visual-capture-on-failure"
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
          checked={value.captureOnFailure !== false}
          onChange={(e) =>
            onChange({
              ...value,
              captureOnFailure: e.target.checked,
            })
          }
        />
        <label
          htmlFor="visual-capture-on-failure"
          className="font-normal text-zinc-800 dark:text-zinc-200"
        >
          <span className="font-medium text-zinc-900 dark:text-white">
            Capture screenshots even when the probe fails
          </span>
          <span className="block text-xs text-muted-foreground">
            Diagnostic captures (bot wall, 5xx, TLS error) are stored separately
            and never affect the similarity baseline.
          </span>
        </label>
      </div>
      {/* V-10: hash algorithm selector. Switching algorithms re-baselines
          the monitor; the helper text explains so operators don't think
          previous captures are lost. */}
      <label className="flex flex-col gap-1">
        <span className="font-medium text-zinc-900 dark:text-white">
          Perceptual hash algorithm
        </span>
        <span className="text-xs text-muted-foreground">
          {value.hashAlgorithm
            ? HASH_ALGORITHM_DESCRIPTIONS[value.hashAlgorithm as VisualHashAlgorithm]
            : HASH_ALGORITHM_DESCRIPTIONS.dhash}
          {" Switching algorithms re-baselines the monitor on the next capture."}
        </span>
        <select
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          value={value.hashAlgorithm ?? "dhash"}
          onChange={(e) =>
            onChange({
              ...value,
              hashAlgorithm: e.target.value as VisualHashAlgorithm,
            })
          }
        >
          {VISUAL_HASH_ALGORITHMS.map((algo) => (
            <option key={algo} value={algo}>
              {algo}
            </option>
          ))}
        </select>
      </label>

      {/* V-11: ignore-region editor. Hidden inside <details> so first-time
          operators are not overwhelmed; they can opt in once they see ad /
          chat widgets producing false-positive change events. */}
      <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer font-medium text-zinc-900 dark:text-white">
          Ignore regions ({(value.ignoreRegions ?? []).length}/{VISUAL_MAX_IGNORE_REGIONS})
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Mask up to {VISUAL_MAX_IGNORE_REGIONS} rectangles before hashing — useful for
          dynamic widgets (timers, ads, chat notifications) that constantly cross the
          similarity threshold. Coordinates are percentages of the captured image.
        </p>
        <div className="mt-3">
          <MonitorVisualMaskEditor
            regions={value.ignoreRegions ?? []}
            onChange={(regions: VisualIgnoreRegion[]) =>
              onChange({ ...value, ignoreRegions: regions })
            }
            maxRegions={VISUAL_MAX_IGNORE_REGIONS}
          />
        </div>
      </details>

      <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer font-medium text-zinc-900 dark:text-white">
          Browser wait and steps
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Wait for SPA content before taking the screenshot. Steps accept a JSON array with
          safe actions like {"[{\"action\":\"wait\",\"ms\":500},{\"action\":\"scroll\"}]"}.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-900 dark:text-white">Wait for selector</span>
            <Input
              placeholder="main .loaded"
              value={value.waitFor?.selector ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  waitFor: {
                    ...(value.waitFor ?? {}),
                    selector: e.target.value.trim() || null,
                  },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-zinc-900 dark:text-white">Extra wait (ms)</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={value.waitFor?.timeoutMs ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                onChange({
                  ...value,
                  waitFor: {
                    ...(value.waitFor ?? {}),
                    timeoutMs: raw === "" ? null : Math.max(0, Math.min(10_000, Number(raw) || 0)),
                  },
                });
              }}
            />
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-1">
          <span className="font-medium text-zinc-900 dark:text-white">Browser steps JSON</span>
          <textarea
            data-testid="visual-browser-steps-json"
            className="min-h-24 rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            value={stepsText}
            onChange={(e) => {
              const raw = e.target.value;
              setStepsText(raw);
              try {
                const trimmed = raw.trim();
                const parsed = trimmed ? JSON.parse(trimmed) : null;
                if (parsed !== null && !Array.isArray(parsed)) {
                  setStepsParseError("Steps must be a JSON array.");
                  return;
                }
                setStepsParseError(null);
                onChange({ ...value, steps: parsed as VisualThresholds["steps"] });
              } catch (error) {
                const message = error instanceof Error ? error.message : "Invalid JSON";
                setStepsParseError(message);
              }
            }}
          />
          {stepsParseError ? (
            <p className="text-xs text-red-600 dark:text-red-300" role="alert">
              Invalid steps JSON: {stepsParseError}
            </p>
          ) : null}
        </label>
      </details>

      <label className="flex flex-col gap-1">
        <span className="font-medium text-zinc-900 dark:text-white">
          Content ↔ screenshot time window (seconds)
        </span>
        <span className="text-xs text-muted-foreground">
          When the same check_id cannot match a PNG (e.g. screenshot failed), link the nearest
          capture within ±N seconds of the content change. Empty = server default (120s). Set 0 to
          disable fallback.
        </span>
        <Input
          inputMode="numeric"
          placeholder="120"
          value={
            value.contentCorrelationWindowSeconds === null ||
            value.contentCorrelationWindowSeconds === undefined
              ? ""
              : String(value.contentCorrelationWindowSeconds)
          }
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange({
              ...value,
              contentCorrelationWindowSeconds:
                raw === "" ? null : Math.max(0, Math.min(86400, Number(raw) || 0)),
            });
          }}
        />
      </label>
    </div>
  );
}
