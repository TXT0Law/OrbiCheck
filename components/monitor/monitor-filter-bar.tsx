"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMonitorStore } from "@/lib/stores/monitor-store";
import {
  parseMonitorTagInput,
  normalizeMonitorTag,
} from "@/lib/utils/monitor-tags";
import {
  MONITOR_LIST_SORT_FIELDS,
  type MonitorListSort,
  type MonitorListSortField,
  type MonitorListSortDirection,
  type MonitorStatus,
} from "@/shared/types/monitor";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "degraded", label: "Degraded" },
  { value: "paused", label: "Paused" },
  { value: "pending", label: "Pending" },
];

const SORT_LABELS: Record<MonitorListSortField, string> = {
  createdAt: "Created",
  updatedAt: "Updated",
  displayName: "Name",
  lastCheckAt: "Last check",
  lastResponseTimeMs: "Latency",
  uptimePercentage: "Uptime",
};

function parseSortValue(raw: string): MonitorListSort | null {
  if (!raw) return null;
  const [field, dir] = raw.split(":") as [
    MonitorListSortField,
    MonitorListSortDirection,
  ];
  if (!MONITOR_LIST_SORT_FIELDS.includes(field)) return null;
  if (dir !== "asc" && dir !== "desc") return null;
  return { field, direction: dir };
}

function sortToValue(sort: MonitorListSort | null): string {
  return sort ? `${sort.field}:${sort.direction}` : "";
}

export function MonitorFilterBar() {
  const searchQuery = useMonitorStore((s) => s.searchQuery);
  const setSearchQuery = useMonitorStore((s) => s.setSearchQuery);
  const statusFilter = useMonitorStore((s) => s.statusFilter);
  const setStatusFilter = useMonitorStore((s) => s.setStatusFilter);

  const tagFilters = useMonitorStore((s) => s.tagFilters);
  const setTagFilters = useMonitorStore((s) => s.setTagFilters);
  const tagMatch = useMonitorStore((s) => s.tagMatch);
  const setTagMatch = useMonitorStore((s) => s.setTagMatch);
  const latencyMaxMs = useMonitorStore((s) => s.latencyMaxMs);
  const setLatencyMaxMs = useMonitorStore((s) => s.setLatencyMaxMs);
  const uptimeMinPercent = useMonitorStore((s) => s.uptimeMinPercent);
  const setUptimeMinPercent = useMonitorStore((s) => s.setUptimeMinPercent);
  const sort = useMonitorStore((s) => s.sort);
  const setSort = useMonitorStore((s) => s.setSort);
  const resetAdvancedFilters = useMonitorStore((s) => s.resetAdvancedFilters);

  const [tagDraft, setTagDraft] = useState("");

  function commitTagDraft() {
    const parsed = parseMonitorTagInput(tagDraft);
    if (parsed.length === 0) {
      setTagDraft("");
      return;
    }
    const next = new Set(tagFilters);
    for (const tag of parsed) next.add(tag);
    setTagFilters(Array.from(next));
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setTagFilters(tagFilters.filter((t) => t !== tag));
  }

  const advancedActive =
    tagFilters.length > 0 ||
    latencyMaxMs != null ||
    uptimeMinPercent != null ||
    sort != null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name or URL…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md min-h-11 border-2 border-zinc-300 text-base dark:border-zinc-600 sm:text-sm"
        />
        <select
          value={statusFilter ?? ""}
          onChange={(e) =>
            setStatusFilter(e.target.value === "" ? null : (e.target.value as MonitorStatus))
          }
          className="min-h-11 min-w-[11rem] rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          aria-label="Status filter"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={sortToValue(sort)}
          onChange={(e) => setSort(parseSortValue(e.target.value))}
          aria-label="Sort monitors"
          className="min-h-11 min-w-[11rem] rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="">Sort: default (newest)</option>
          {MONITOR_LIST_SORT_FIELDS.flatMap((field) => [
            <option key={`${field}:desc`} value={`${field}:desc`}>
              {SORT_LABELS[field]} ↓
            </option>,
            <option key={`${field}:asc`} value={`${field}:asc`}>
              {SORT_LABELS[field]} ↑
            </option>,
          ])}
        </select>
      </div>

      <details
        className="rounded-md border-2 border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        open={advancedActive}
      >
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Advanced filters
          {advancedActive ? (
            <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-300">
              active
            </span>
          ) : null}
        </summary>

        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <label
              htmlFor="monitor-tag-input"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Tags
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {tagFilters.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    className="ml-1 rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    onClick={() => removeTag(tag)}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <Input
                id="monitor-tag-input"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitTagDraft();
                  } else if (
                    e.key === "Backspace" &&
                    tagDraft === "" &&
                    tagFilters.length > 0
                  ) {
                    removeTag(tagFilters[tagFilters.length - 1]!);
                  }
                }}
                onBlur={commitTagDraft}
                placeholder="Type tag, press Enter…"
                className="min-h-9 max-w-xs flex-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="monitor-tag-match"
                  value="any"
                  checked={tagMatch === "any"}
                  onChange={() => setTagMatch("any")}
                />
                Match any
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="monitor-tag-match"
                  value="all"
                  checked={tagMatch === "all"}
                  onChange={() => setTagMatch("all")}
                />
                Match all
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="monitor-latency-max"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Max latency (ms)
            </label>
            <Input
              id="monitor-latency-max"
              type="number"
              min={0}
              step={50}
              value={latencyMaxMs ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setLatencyMaxMs(v === "" ? null : Number(v));
              }}
              placeholder="No limit"
              className="min-h-9 text-sm"
            />

            <label
              htmlFor="monitor-uptime-min"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Min uptime (%)
            </label>
            <Input
              id="monitor-uptime-min"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={uptimeMinPercent ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setUptimeMinPercent(v === "" ? null : Number(v));
              }}
              placeholder="No floor"
              className="min-h-9 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              resetAdvancedFilters();
              setTagDraft("");
            }}
            disabled={!advancedActive && !tagDraft}
          >
            Reset
          </Button>
        </div>
      </details>
    </div>
  );
}

// Local export so tests can reuse the same normaliser without re-importing
// `lib/utils/monitor-tags` directly. Keeps tag handling in a single place.
export const __testables = { normalizeMonitorTag };
