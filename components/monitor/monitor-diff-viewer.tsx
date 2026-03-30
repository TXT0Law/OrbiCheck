"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiffMethod } from "react-diff-viewer-continued";
import { useTheme } from "next-themes";
import { AlertCircle, Image as ImageIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { monitorVisualCapturePngUrl } from "@/lib/api/monitors";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useMonitorDiff } from "@/lib/hooks/use-monitors";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";
import {
  isDiffRequestTimeoutError,
  isSnapshotPurgedDiffError,
  shouldClearChangeQueryFromDiffError,
} from "@/lib/utils/monitor-diff-errors";
import {
  breakLongHtmlLines,
  extractHtmlTitleAndTextPreview,
} from "@/lib/utils/monitor-html-readability";
import type { MonitorDiff } from "@/shared/types/monitor";

/** Below this total character count (after any server truncation), offer client split diff. */
const CLIENT_SPLIT_DIFF_MAX_CHARS = 96_000;

const DIFF_IFRAME_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.45;
    background: #fafafa; color: #18181b; }
  @media (prefers-color-scheme: dark) {
    body { background: #09090b; color: #fafafa; }
    table.diff { border-color: #3f3f46 !important; }
    .diff_header { background: #27272a !important; color: #a1a1aa !important; }
    .diff_add { background: #052e16 !important; }
    .diff_chg { background: #422006 !important; }
    .diff_sub { background: #450a0a !important; }
  }
  table.diff { border-collapse: collapse; width: 100%; table-layout: fixed; border: 1px solid #d4d4d8; }
  table.diff td, table.diff th { border: 1px solid #e4e4e7; padding: 4px 8px; vertical-align: top;
    white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
  .diff_header { background: #f4f4f5; font-weight: 600; }
  .diff_next { background: #eef2ff; }
  .diff_add { background: #dcfce7; }
  .diff_chg { background: #ffedd5; }
  .diff_sub { background: #fee2e2; }
`;

const ReactDiffViewer = dynamic(
  () => import("react-diff-viewer-continued").then((m) => m.default),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-md" />,
  }
);

interface MonitorDiffViewerProps {
  monitorId: string;
  changeId: string;
  onDismiss?: () => void;
  onInvalidChange?: () => void;
}

type DiffView = "server" | "split" | "unified";

function useDiffIframeSrc(diffHtml: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!diffHtml) {
      setUrl(null);
      return;
    }
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${DIFF_IFRAME_CSS}</style></head><body>${diffHtml}</body></html>`;
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [diffHtml]);

  return url;
}

function allowClientSplitDiff(data: MonitorDiff): boolean {
  return (
    data.previousContent.length + data.currentContent.length <= CLIENT_SPLIT_DIFF_MAX_CHARS
  );
}

export function MonitorDiffViewer({
  monitorId,
  changeId,
  onDismiss,
  onInvalidChange,
}: MonitorDiffViewerProps) {
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);
  const { data, isLoading, error, isError } = useMonitorDiff(monitorId, changeId);
  const [viewMode, setViewMode] = useState<DiffView>("server");
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const iframeSrc = useDiffIframeSrc(data?.diffHtml ?? "");

  const canUseClientDiff = useMemo(() => (data ? allowClientSplitDiff(data) : false), [data]);
  const useDarkDiffTheme = mounted && resolvedTheme === "dark";

  const snippet = useMemo(
    () => (data ? extractHtmlTitleAndTextPreview(data.currentContent) : null),
    [data]
  );
  const clientPrev = useMemo(
    () => (data ? breakLongHtmlLines(data.previousContent) : ""),
    [data]
  );
  const clientCur = useMemo(
    () => (data ? breakLongHtmlLines(data.currentContent) : ""),
    [data]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isError && error && onInvalidChange && shouldClearChangeQueryFromDiffError(error)) {
      onInvalidChange();
    }
  }, [isError, error, onInvalidChange]);

  useEffect(() => {
    if (!isLoading && data && panelRef.current) {
      panelRef.current.focus({ preventScroll: true });
    }
  }, [isLoading, data, changeId]);

  useEffect(() => {
    if (!canUseClientDiff && (viewMode === "split" || viewMode === "unified")) {
      setViewMode("server");
    }
  }, [canUseClientDiff, viewMode]);

  if (isLoading) {
    return (
      <div aria-live="polite" aria-busy="true">
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    const purged = error ? isSnapshotPurgedDiffError(error) : false;
    const timedOut = error ? isDiffRequestTimeoutError(error) : false;
    const missingChange = error ? shouldClearChangeQueryFromDiffError(error) : false;
    const forbidden = error && ApiError.isApiError(error) && error.status === 403;
    return (
      <Card
        className="border-red-200 dark:border-red-900"
        role="alert"
        aria-live="assertive"
      >
        <CardContent className="flex flex-col items-center py-10 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {forbidden
              ? t.errForbidden
              : purged
                ? t.errPurged
                : timedOut
                  ? t.errTimeout
                  : missingChange
                    ? t.errMissingChange
                    : t.errGeneric}
          </p>
          {onDismiss ? (
            <Button variant="outline" size="sm" onClick={onDismiss} className="mt-4">
              {t.dismiss}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      ref={panelRef}
      id="monitor-content-diff-panel"
      tabIndex={-1}
      className="outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      role="region"
      aria-label={t.diffRegionAria}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle className="text-base">{t.diffTitle}</CardTitle>
          {data.linkedVisualCaptureId ? (
            <a
              href={monitorVisualCapturePngUrl(monitorId, data.linkedVisualCaptureId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full flex-wrap items-center gap-1 text-xs font-medium text-purple-600 hover:underline dark:text-purple-400"
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t.openLinkedScreenshot}
              {data.linkedVisualCorrelation === "check_id" ? (
                <span className="font-normal text-muted-foreground">({t.linkedCorrelationCheckId})</span>
              ) : data.linkedVisualCorrelation === "time_window" ? (
                <span className="font-normal text-muted-foreground">({t.linkedCorrelationTimeWindow})</span>
              ) : null}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as DiffView)}
            className="h-9 max-w-[220px] rounded-md border-2 border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="server">Table preview (fast)</option>
            {canUseClientDiff ? (
              <>
                <option value="split">Split view (client)</option>
                <option value="unified">Unified (client)</option>
              </>
            ) : null}
          </select>
          {onDismiss ? (
            <Button variant="outline" size="sm" onClick={onDismiss} className="h-9 px-2" aria-label={t.closeDiffAria}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.truncated ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Large snapshots were truncated for this preview (server limit per side). Original sizes:{" "}
            {(data.originalPreviousLength ?? 0).toLocaleString()} /{" "}
            {(data.originalCurrentLength ?? 0).toLocaleString()} characters. Prefer this table view for large
            pages.
          </p>
        ) : null}
        {!canUseClientDiff && viewMode === "server" ? (
          <p className="text-xs text-muted-foreground">
            Client-side split diff is disabled when combined snapshot size exceeds{" "}
            {CLIENT_SPLIT_DIFF_MAX_CHARS.toLocaleString()} characters (keeps the tab responsive).
          </p>
        ) : null}

        {snippet && (snippet.title || snippet.textPreview) ? (
          <div
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200"
            role="region"
            aria-label={t.diffSnippetPreview}
          >
            {snippet.title ? (
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                <span className="text-muted-foreground">{t.diffSnippetTitle}: </span>
                {snippet.title}
              </p>
            ) : null}
            {snippet.textPreview ? (
              <p className="mt-1 line-clamp-4 text-muted-foreground">{snippet.textPreview}</p>
            ) : null}
          </div>
        ) : null}

        <div
          className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
          aria-live="polite"
        >
          {viewMode === "server" && iframeSrc ? (
            <iframe
              title="HTML diff preview"
              src={iframeSrc}
              className="h-[min(70vh,720px)] w-full border-0 bg-zinc-50 dark:bg-zinc-950"
              sandbox=""
              referrerPolicy="no-referrer"
            />
          ) : null}
          {viewMode === "server" && !iframeSrc ? (
            <div className="p-4 text-sm text-muted-foreground">{t.diffNoHtml}</div>
          ) : null}
          {viewMode !== "server" && canUseClientDiff ? (
            <div className="max-h-[min(70vh,720px)] overflow-auto p-1">
              <ReactDiffViewer
                oldValue={clientPrev}
                newValue={clientCur}
                splitView={viewMode === "split"}
                compareMethod={"diffLines" as DiffMethod}
                useDarkTheme={useDarkDiffTheme}
                leftTitle="Previous Snapshot"
                rightTitle="Current Snapshot"
                styles={{
                  contentText: {
                    fontSize: "13px",
                    lineHeight: 1.5,
                  },
                }}
              />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
