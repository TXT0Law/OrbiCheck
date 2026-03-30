"use client";

import { useMemo, useState } from "react";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { monitorVisualCapturePngUrl } from "@/lib/api/monitors";
import { useMonitorVisualCaptures, useMonitorVisualChanges } from "@/lib/hooks/use-monitors";
import { cn } from "@/lib/utils";

interface MonitorVisualTimelineProps {
  monitorId: string;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function MonitorVisualTimeline({ monitorId }: MonitorVisualTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wipePct, setWipePct] = useState(50);

  const changesQ = useMonitorVisualChanges(monitorId, { limit: 50, page: 1 });
  const capturesQ = useMonitorVisualCaptures(monitorId, { limit: 30, page: 1 });

  const changes = changesQ.data?.data ?? [];
  const captures = capturesQ.data?.data ?? [];

  const selected = useMemo(
    () => changes.find((c) => c.id === selectedId) ?? changes[0] ?? null,
    [changes, selectedId]
  );

  const beforeUrl = selected
    ? monitorVisualCapturePngUrl(monitorId, selected.previousCaptureId)
    : null;
  const afterUrl = selected
    ? monitorVisualCapturePngUrl(monitorId, selected.currentCaptureId)
    : null;

  const loading = changesQ.isLoading || capturesQ.isLoading;

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
              No visual regressions detected yet. Screenshots are stored on each successful check
              when this capability is enabled; the first capture establishes the baseline.
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
                            : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/60"
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
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent captures
            </h4>
            {captures.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No captures yet. Trigger a check or wait for the next scheduled run. Failures (bot
                walls, timeouts) may skip storage.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {captures.slice(0, 12).map((c) => (
                  <li
                    key={c.id}
                    className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={monitorVisualCapturePngUrl(monitorId, c.id)}
                      alt=""
                      width={120}
                      height={68}
                      className="h-16 w-28 object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
