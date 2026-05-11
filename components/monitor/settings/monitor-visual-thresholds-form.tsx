"use client";

import { Input } from "@/components/ui/input";
import type { VisualThresholds } from "@/shared/types/monitor";

interface MonitorVisualThresholdsFormProps {
  value: VisualThresholds;
  onChange: (v: VisualThresholds) => void;
}

export function MonitorVisualThresholdsForm({ value, onChange }: MonitorVisualThresholdsFormProps) {
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
