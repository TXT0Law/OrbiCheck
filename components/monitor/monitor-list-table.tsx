"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  formatMilliseconds,
  formatPercent,
} from "@/lib/utils/monitor-formatters";
import { useMonitorStore } from "@/lib/stores/monitor-store";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import type { Monitor } from "@/shared/types/monitor";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";

import { MonitorActionsDropdown } from "./monitor-actions-dropdown";
import { MonitorStatusBadge } from "./monitor-status-badge";

interface MonitorListTableProps {
  monitors: Monitor[];
}

function formatWhen(iso: string | null, neverLabel: string) {
  if (!iso) return neverLabel;
  const d = new Date(iso);
  return d.toLocaleString();
}

export function MonitorListTable({ monitors }: MonitorListTableProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).monitor;
  const selectedIds = useMonitorStore((s) => s.selectedMonitorIds);
  const toggleMonitorSelection = useMonitorStore((s) => s.toggleMonitorSelection);
  const selectMonitors = useMonitorStore((s) => s.selectMonitors);
  const deselectMonitors = useMonitorStore((s) => s.deselectMonitors);

  const visibleIds = useMemo(() => monitors.map((m) => m.id), [monitors]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedCount = visibleIds.reduce(
    (acc, id) => acc + (selectedSet.has(id) ? 1 : 0),
    0,
  );
  const allSelected =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someSelected = visibleSelectedCount > 0 && !allSelected;

  function handleToggleAll() {
    if (allSelected) {
      deselectMonitors(visibleIds);
    } else {
      selectMonitors(visibleIds);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border-2 border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-950/30">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="border-b-2 border-zinc-200 hover:bg-transparent dark:border-zinc-700">
            <TableHead className="w-10 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <input
                type="checkbox"
                aria-label={
                  allSelected ? messages.deselectAllAria : messages.selectAllAria
                }
                className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={handleToggleAll}
                disabled={visibleIds.length === 0}
              />
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableName}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableUrl}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableCapabilities}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableStatus}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableLastCheck}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableUptime}
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableLatency}
            </TableHead>
            <TableHead className="w-14 text-right text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {messages.tableActions}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {monitors.map((m) => {
            const checked = selectedSet.has(m.id);
            return (
              <TableRow
                key={m.id}
                data-state={checked ? "selected" : undefined}
                className={
                  checked
                    ? "bg-blue-50/40 dark:bg-blue-950/20"
                    : undefined
                }
              >
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={messages.selectMonitorAria(m.displayName)}
                    className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600"
                    checked={checked}
                    onChange={() => toggleMonitorSelection(m.id)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/monitor/${m.id}`}
                    className="font-medium text-zinc-900 hover:underline dark:text-white"
                  >
                    {m.displayName}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="break-all" title={m.url}>
                    {m.url}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-[200px] flex-wrap gap-1">
                    {m.enabledCapabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {CAPABILITY_CONFIG[cap].shortLabel}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <MonitorStatusBadge status={m.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatWhen(m.lastCheckAt, messages.never)}
                </TableCell>
                <TableCell className="text-zinc-700 dark:text-zinc-300">
                  {formatPercent(m.uptimePercentage, 1)}
                </TableCell>
                <TableCell>{formatMilliseconds(m.lastResponseTimeMs)}</TableCell>
                <TableCell className="text-right">
                  <MonitorActionsDropdown monitor={m} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
