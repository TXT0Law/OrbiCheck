"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { monitorVisualCapturePngUrl } from "@/lib/api/monitors";
import {
  useMonitor,
  useMonitorVisualCaptures,
  useMonitorVisualChanges,
  useTriggerVisualCaptureNow,
} from "@/lib/hooks/use-monitors";
import { cn } from "@/lib/utils";

interface MonitorVisualTimelineProps {
  monitorId: string;
}

const CAPTURE_NOW_COOLDOWN_SECONDS = 12; // Matches MONITOR_MANUAL_CHECK_COOLDOWN by default; server enforces real limit.
const VISUAL_DIFF_GRID_SIZE = 8;

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "just now";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  if (minutes < 60) return remSec ? `${minutes}m ${remSec}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
}

function computeNextCaptureLabel(
  lastCheckAtIso: string | null | undefined,
  intervalSeconds: number | null | undefined,
): { label: string; etaSeconds: number | null } {
  if (!intervalSeconds || intervalSeconds <= 0) {
    return { label: "Waiting for the first scheduled check", etaSeconds: null };
  }
  if (!lastCheckAtIso) {
    return {
      label: "First check has not run yet — usually within the next minute.",
      etaSeconds: null,
    };
  }
  const last = new Date(lastCheckAtIso).getTime();
  if (Number.isNaN(last)) {
    return { label: "Next capture is scheduled by the monitor interval.", etaSeconds: null };
  }
  const nextMs = last + intervalSeconds * 1000;
  const etaSeconds = Math.max(0, (nextMs - Date.now()) / 1000);
  return {
    label: `Next automatic capture in ~${formatDuration(etaSeconds)}`,
    etaSeconds,
  };
}

export function MonitorVisualTimeline({ monitorId }: MonitorVisualTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wipePct, setWipePct] = useState(50);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const monitorQ = useMonitor(monitorId);
  const changesQ = useMonitorVisualChanges(monitorId, { limit: 50, page: 1 });
  const capturesQ = useMonitorVisualCaptures(monitorId, { limit: 30, page: 1 });
  const captureNowMutation = useTriggerVisualCaptureNow(monitorId);

  // Memoising the empty fallback prevents the `useMemo`s below from
  // re-running on every render when the queries return `undefined`.
  const changes = useMemo(() => changesQ.data?.data ?? [], [changesQ.data?.data]);
  const captures = useMemo(() => capturesQ.data?.data ?? [], [capturesQ.data?.data]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const id = setInterval(() => {
      setCooldownRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownRemaining]);

  const selected = useMemo(
    () => changes.find((c) => c.id === selectedId) ?? changes[0] ?? null,
    [changes, selectedId],
  );

  const beforeUrl = selected
    ? monitorVisualCapturePngUrl(monitorId, selected.previousCaptureId)
    : null;
  const afterUrl = selected
    ? monitorVisualCapturePngUrl(monitorId, selected.currentCaptureId)
    : null;
  const changedBlocks = selected?.diffSummary.changedBlocks ?? [];

  const loading = changesQ.isLoading || capturesQ.isLoading;

  const monitor = monitorQ.data;
  const baselineCapture = useMemo(() => {
    const successful = captures.filter((c) => c.isDiagnostic !== true);
    if (successful.length === 0) return null;
    return successful[successful.length - 1];
  }, [captures]);

  const totals = useMemo(() => {
    const success = captures.filter((c) => c.isDiagnostic !== true).length;
    const diagnostic = captures.filter((c) => c.isDiagnostic === true).length;
    return { success, diagnostic };
  }, [captures]);

  const { label: nextCaptureLabel } = computeNextCaptureLabel(
    monitor?.lastCheckAt,
    monitor?.intervalSeconds,
  );

  const triggerCaptureNow = async () => {
    setActionError(null);
    try {
      await captureNowMutation.mutateAsync();
      setCooldownRemaining(CAPTURE_NOW_COOLDOWN_SECONDS);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Capture failed";
      setActionError(message);
    }
  };

  const captureNowDisabled =
    captureNowMutation.isPending || cooldownRemaining > 0;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading visual history…
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Visual change events</CardTitle>
          <p className="text-xs text-muted-foreground">
            Compared with dHash (64-bit). A row appears when similarity drops below your
            threshold (default 92%).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {changes.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No visual regressions detected yet. Screenshots are stored on each successful
              check when this capability is enabled; the first capture establishes the
              baseline.
            </p>
          ) : (
            <ScrollArea className="h-[320px] px-6">
              <ul className="space-y-2 pr-3 pb-4">
                {changes.map((ch) => {
                  const active = selected?.id === ch.id;
                  const sim = ch.diffSummary.similarityPercent;
                  const ham = ch.diffSummary.hammingDistance;
                  return (
                    <li key={ch.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(ch.id);
                          setWipePct(50);
                        }}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          active
                            ? "border-purple-500 bg-purple-50 dark:bg-purple-950/40"
                            : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/60",
                        )}
                      >
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {formatTs(ch.detectedAt)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {typeof sim === "number" ? (
                            <Badge variant="secondary">{sim}% similar</Badge>
                          ) : null}
                          {typeof ham === "number" ? (
                            <Badge variant="outline">Δ {ham} bits</Badge>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compare</CardTitle>
          <p className="text-xs text-muted-foreground">
            Drag the slider to wipe between previous (left) and current (right) captures.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected || !beforeUrl || !afterUrl ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-12 text-center text-sm text-muted-foreground dark:border-zinc-700">
              {changes.length === 0
                ? "Run a successful check to capture the first screenshot. Comparison appears after there is more than one capture and similarity drops below your threshold."
                : "Select a visual change to compare captures."}
            </p>
          ) : (
            <>
              <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-md border border-zinc-200 bg-zinc-950 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element -- same-origin API PNG with session cookie */}
                <img
                  src={afterUrl}
                  alt="Current capture"
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - wipePct}% 0 0)` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beforeUrl}
                    alt="Previous capture"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>
                {changedBlocks.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0">
                    {changedBlocks.map((block) => {
                      const row = Math.floor(block / VISUAL_DIFF_GRID_SIZE);
                      const col = block % VISUAL_DIFF_GRID_SIZE;
                      return (
                        <span
                          key={block}
                          data-testid="visual-diff-changed-block"
                          className="absolute border border-red-400 bg-red-500/20 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
                          style={{
                            left: `${(col / VISUAL_DIFF_GRID_SIZE) * 100}%`,
                            top: `${(row / VISUAL_DIFF_GRID_SIZE) * 100}%`,
                            width: `${100 / VISUAL_DIFF_GRID_SIZE}%`,
                            height: `${100 / VISUAL_DIFF_GRID_SIZE}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="shrink-0">Before</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={wipePct}
                  onChange={(e) => setWipePct(Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
                <span className="shrink-0">After</span>
              </label>
            </>
          )}

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent captures
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totals.success} successful · {totals.diagnostic} diagnostic
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={captureNowDisabled}
                  onClick={triggerCaptureNow}
                  data-testid="visual-capture-now-button"
                >
                  {captureNowMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Capturing…
                    </span>
                  ) : cooldownRemaining > 0 ? (
                    <span>Capture now ({cooldownRemaining}s)</span>
                  ) : (
                    <span>Capture now</span>
                  )}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {nextCaptureLabel}
                </span>
              </div>
            </div>
            {actionError ? (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
                {actionError}
              </p>
            ) : null}
            {captures.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No captures yet. Click <strong>Capture now</strong> to trigger a synchronous
                screenshot, or wait for the next scheduled check. Failures (bot walls,
                timeouts) are still stored as diagnostic captures so you can see what the
                target looked like.
              </p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {captures.slice(0, 12).map((c) => {
                  const isBaseline = baselineCapture?.id === c.id;
                  const isDiagnostic = c.isDiagnostic === true;
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        "relative overflow-hidden rounded border",
                        isDiagnostic
                          ? "border-amber-300/70 dark:border-amber-700/70"
                          : "border-zinc-200 dark:border-zinc-700",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={monitorVisualCapturePngUrl(monitorId, c.id)}
                        alt=""
                        width={120}
                        height={68}
                        className={cn(
                          "h-16 w-28 object-cover",
                          isDiagnostic && "opacity-70 grayscale",
                        )}
                      />
                      {isBaseline ? (
                        <Badge
                          variant="secondary"
                          className="absolute left-1 top-1 px-1 py-0 text-[10px] uppercase tracking-wide"
                        >
                          Baseline
                        </Badge>
                      ) : null}
                      {isDiagnostic ? (
                        <Badge
                          variant="outline"
                          className="absolute right-1 top-1 border-amber-400 bg-amber-50 px-1 py-0 text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-200"
                        >
                          Failed
                        </Badge>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
