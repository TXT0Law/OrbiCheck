"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";

import { ChevronDown } from "lucide-react";
import { Download } from "lucide-react";
import { Image as ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import {
  MONITOR_CHANGES_PAGE_SIZE,
  useMonitorChangesInfinite,
} from "@/lib/hooks/use-monitors";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";
import { isMonitorChangesPdfExportEnabledInUi } from "@/lib/i18n/monitor-detail";
import { cn } from "@/lib/utils";
import { monitorVisualCapturePngUrl } from "@/lib/api/monitors";
import { downloadFromApiGet } from "@/lib/utils/export-download";
import { downloadJson } from "@/lib/utils/export-json";
import { inferChangeCategoryForMonitorChange } from "@/shared/constants/monitor-change-categories";
import type { MonitorChange } from "@/shared/types/monitor";

import { MonitorChangeFilter, type ChangeSizeFilter } from "./monitor-change-filter";

const SIZE_FILTER_STORAGE_KEY = "monitor-content-size-filter";

interface MonitorChangeTimelineProps {
  monitorId: string;
  onSelectChange?: (id: string | null) => void;
  selectedChangeId?: string | null;
}

function inferCategory(change: MonitorChange): "small" | "medium" | "large" {
  return inferChangeCategoryForMonitorChange({
    ...change.diffSummary,
    linesAdded: change.diffSummary.linesAdded,
    linesRemoved: change.diffSummary.linesRemoved,
  });
}

/** Client-side filter when showing all pages without server category (legacy behavior). */
function filterBySize(rows: MonitorChange[], sizeFilter: ChangeSizeFilter) {
  return rows.filter((change) => {
    const cat = inferCategory(change);
    switch (sizeFilter) {
      case "small":
        return cat === "small";
      case "medium":
        return cat === "medium";
      case "large":
        return cat === "large";
      default:
        return true;
    }
  });
}

function categoryBadgeClass(cat: "small" | "medium" | "large"): string {
  switch (cat) {
    case "small":
      return "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
    case "medium":
      return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100";
    case "large":
      return "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100";
    default:
      return "";
  }
}

type TimelineRow =
  | { kind: "single"; change: MonitorChange }
  | { kind: "group"; fingerprint: string; changes: MonitorChange[] };

function buildFingerprintGroups(changes: MonitorChange[]): TimelineRow[] {
  const out: TimelineRow[] = [];
  let i = 0;
  while (i < changes.length) {
    const fp = changes[i].diffSummary.diffFingerprint;
    if (!fp) {
      out.push({ kind: "single", change: changes[i] });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < changes.length && changes[j].diffSummary.diffFingerprint === fp) {
      j += 1;
    }
    if (j - i === 1) {
      out.push({ kind: "single", change: changes[i] });
    } else {
      out.push({
        kind: "group",
        fingerprint: fp,
        changes: changes.slice(i, j),
      });
    }
    i = j;
  }
  return out;
}

function readStoredSizeFilter(): ChangeSizeFilter {
  if (typeof window === "undefined") return "all";
  try {
    const v = window.localStorage.getItem(SIZE_FILTER_STORAGE_KEY);
    if (v === "small" || v === "medium" || v === "large" || v === "all") return v;
  } catch {
    /* ignore */
  }
  return "all";
}

function persistSizeFilter(v: ChangeSizeFilter) {
  try {
    window.localStorage.setItem(SIZE_FILTER_STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}

export function MonitorChangeTimeline({
  monitorId,
  onSelectChange,
  selectedChangeId,
}: MonitorChangeTimelineProps) {
  const { toast } = useToast();
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);
  const pdfExportUi = isMonitorChangesPdfExportEnabledInUi();
  const [sizeFilter, setSizeFilter] = useState<ChangeSizeFilter>("all");
  const [filterHydrated, setFilterHydrated] = useState(false);
  const firstLargeRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    setSizeFilter(readStoredSizeFilter());
    setFilterHydrated(true);
  }, []);

  const handleSizeFilterChange = (v: ChangeSizeFilter) => {
    setSizeFilter(v);
    persistSizeFilter(v);
  };

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useMonitorChangesInfinite(monitorId);

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const totalCount = data?.pages[0]?.meta?.total ?? 0;

  useEffect(() => {
    if (!selectedChangeId) return;
    if (rows.some((c) => c.id === selectedChangeId)) return;
    if (isFetchingNextPage) return;
    if (hasNextPage) {
      void fetchNextPage();
    }
  }, [selectedChangeId, rows, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filteredChanges = useMemo(
    () => filterBySize(rows, sizeFilter),
    [rows, sizeFilter]
  );

  const groupedRows = useMemo(
    () => buildFingerprintGroups(filteredChanges),
    [filteredChanges]
  );

  const hasSelectedInRows = Boolean(
    selectedChangeId && rows.some((c) => c.id === selectedChangeId)
  );
  const hasSelectedInFiltered = Boolean(
    selectedChangeId && filteredChanges.some((c) => c.id === selectedChangeId)
  );

  const showFilterBanner =
    Boolean(selectedChangeId) &&
    sizeFilter !== "all" &&
    hasSelectedInRows &&
    !hasSelectedInFiltered;

  const loaded = !isLoading && data !== undefined;
  const showPagingBanner =
    Boolean(selectedChangeId) &&
    loaded &&
    !hasSelectedInRows &&
    (totalCount > 0 || isFetchingNextPage);

  const showNoChangesForLink =
    Boolean(selectedChangeId) && loaded && totalCount === 0;

  const showExhaustedWithoutMatch =
    Boolean(selectedChangeId) &&
    loaded &&
    totalCount > 0 &&
    !hasSelectedInRows &&
    !hasNextPage &&
    !isFetchingNextPage;

  function handleExportChanges() {
    downloadJson(`monitor-${monitorId}-changes.json`, filteredChanges);
  }

  function handleExportCsv() {
    const params = new URLSearchParams({ sort: "desc", limit: "5000" });
    if (sizeFilter !== "all") {
      params.set("category", sizeFilter);
    }
    void downloadFromApiGet(
      `/monitors/${monitorId}/changes/export.csv?${params.toString()}`,
      `monitor-${monitorId}-changes.csv`
    ).catch(() => {
      /* toast optional */
    });
  }

  function handleExportPdf() {
    const params = new URLSearchParams({ sort: "desc", limit: "5000" });
    if (sizeFilter !== "all") {
      params.set("category", sizeFilter);
    }
    void downloadFromApiGet(
      `/monitors/${monitorId}/changes/export.pdf?${params.toString()}`,
      `monitor-${monitorId}-changes.pdf`
    ).catch((err) => {
      const msg =
        err instanceof Error && err.message.includes("404")
          ? t.exportPdfUnavailable
          : t.exportPdfFailed;
      toast({ title: msg, variant: "destructive" });
    });
  }

  function handleJumpToLarge() {
    handleSizeFilterChange("large");
    window.setTimeout(() => {
      firstLargeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
  }

  const firstLargeId = useMemo(() => {
    const large = filteredChanges.find((c) => inferCategory(c) === "large");
    return large?.id ?? null;
  }, [filteredChanges]);

  if (!filterHydrated || isLoading) {
    return <p className="text-sm text-muted-foreground">{t.loadingChanges}</p>;
  }

  if (rows.length === 0 && totalCount === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t.noChangesYet}</p>
        {showNoChangesForLink ? (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
            aria-live="polite"
          >
            {t.deepLinkNoChanges}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showFilterBanner ? (
        <div
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
          role="status"
          aria-live="polite"
        >
          <span className="mr-2">{t.filterBanner}</span>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="mr-2 mt-2 sm:mt-0"
            onClick={() => handleSizeFilterChange("all")}
          >
            {t.showAll}
          </Button>
          {onSelectChange ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 sm:mt-0"
              onClick={() => onSelectChange(null)}
            >
              {t.clearSelection}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showPagingBanner && (hasNextPage || showExhaustedWithoutMatch) ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
          aria-live="polite"
        >
          {hasNextPage ? (
            <span>
              {isFetchingNextPage ? t.deepLinkLoadingPages : t.pagingBannerHasMore(MONITOR_CHANGES_PAGE_SIZE)}
            </span>
          ) : null}
          {showExhaustedWithoutMatch ? <span>{t.pagingBannerExhausted}</span> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonitorChangeFilter
          sizeFilter={sizeFilter}
          onSizeFilterChange={handleSizeFilterChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleJumpToLarge}
            disabled={!firstLargeId}
          >
            {t.jumpToLarge}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportChanges}>
            <Download className="mr-1 h-3 w-3" />
            {t.exportJson}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-1 h-3 w-3" />
            {t.exportCsv}
          </Button>
          {pdfExportUi ? (
            <Button type="button" variant="outline" size="sm" onClick={handleExportPdf}>
              <Download className="mr-1 h-3 w-3" />
              {t.exportPdf}
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t.categoryFilterHint}</p>

      <p className="text-xs text-muted-foreground">
        {t.loadedSummary(rows.length, totalCount)}
      </p>

      {filteredChanges.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noRowsMatchFilter}</p>
      ) : (
        <ol className="relative space-y-6 border-l border-zinc-200 pl-6 dark:border-zinc-800">
          {groupedRows.map((row) => {
            if (row.kind === "single") {
              return (
                <ChangeListItem
                  key={row.change.id}
                  monitorId={monitorId}
                  change={row.change}
                  firstLargeRef={firstLargeRef}
                  firstLargeId={firstLargeId}
                  onSelectChange={onSelectChange}
                  selectedChangeId={selectedChangeId}
                  t={t}
                />
              );
            }
            return (
              <li key={`grp-${row.fingerprint}`} className="space-y-1">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-zinc-400 dark:bg-zinc-600" />
                <details className="group rounded-md border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                    <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                    {t.fingerprintGroupSummary(row.changes.length)}
                  </summary>
                  <ul className="mt-2 space-y-3 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    {row.changes.map((ch) => (
                      <li
                        key={ch.id}
                        ref={
                          firstLargeId === ch.id
                            ? (firstLargeRef as Ref<HTMLLIElement>)
                            : undefined
                        }
                        className="space-y-1 pl-2"
                      >
                        <ChangeRowBody
                          monitorId={monitorId}
                          change={ch}
                          onSelectChange={onSelectChange}
                          selectedChangeId={selectedChangeId}
                          t={t}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? t.loading : t.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChangeListItem({
  monitorId,
  change,
  firstLargeRef,
  firstLargeId,
  onSelectChange,
  selectedChangeId,
  t,
}: {
  monitorId: string;
  change: MonitorChange;
  firstLargeRef: RefObject<HTMLLIElement | null>;
  firstLargeId: string | null;
  onSelectChange?: (id: string | null) => void;
  selectedChangeId?: string | null;
  t: ReturnType<typeof getMonitorContentMessages>;
}) {
  return (
    <li
      ref={
        firstLargeId === change.id
          ? (firstLargeRef as Ref<HTMLLIElement>)
          : undefined
      }
      className="space-y-1"
    >
      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-zinc-400 dark:bg-zinc-600" />
      <ChangeRowBody
        monitorId={monitorId}
        change={change}
        onSelectChange={onSelectChange}
        selectedChangeId={selectedChangeId}
        t={t}
      />
    </li>
  );
}

function ChangeRowBody({
  monitorId,
  change,
  onSelectChange,
  selectedChangeId,
  t,
}: {
  monitorId: string;
  change: MonitorChange;
  onSelectChange?: (id: string | null) => void;
  selectedChangeId?: string | null;
  t: ReturnType<typeof getMonitorContentMessages>;
}) {
  const cat = inferCategory(change);
  const preview = change.diffSummary.previewLine;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">
          {new Date(change.detectedAt).toLocaleString(t.dateLocale)}
        </p>
        <Badge
          variant="outline"
          className={cn("text-[10px] font-semibold uppercase", categoryBadgeClass(cat))}
        >
          {cat === "small"
            ? t.categorySmall
            : cat === "medium"
              ? t.categoryMedium
              : t.categoryLarge}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>+{change.diffSummary.linesAdded}</span>
        <span>−{change.diffSummary.linesRemoved}</span>
        {change.diffSummary.linesChanged > 0 ? (
          <span>~{change.diffSummary.linesChanged}</span>
        ) : null}
      </div>
      {preview ? (
        <p
          className="line-clamp-2 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400"
          title={preview}
        >
          {preview}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {onSelectChange ? (
          <button
            type="button"
            onClick={() => onSelectChange(change.id)}
            className={cn(
              "text-sm text-sky-600 hover:underline dark:text-sky-400",
              selectedChangeId === change.id && "font-semibold underline"
            )}
          >
            {t.viewDiff}
          </button>
        ) : null}
        {change.linkedVisualCaptureId ? (
          <a
            href={monitorVisualCapturePngUrl(monitorId, change.linkedVisualCaptureId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline dark:text-purple-400"
          >
            <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t.linkedScreenshot}
            {change.linkedVisualCorrelation === "check_id" ? (
              <span className="font-normal text-muted-foreground">· {t.linkedCorrelationCheckId}</span>
            ) : change.linkedVisualCorrelation === "time_window" ? (
              <span className="font-normal text-muted-foreground">· {t.linkedCorrelationTimeWindow}</span>
            ) : null}
          </a>
        ) : null}
      </div>
    </>
  );
}
