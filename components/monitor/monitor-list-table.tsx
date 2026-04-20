"use client";

import Link from "next/link";

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
import type { Monitor } from "@/shared/types/monitor";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";

import { MonitorActionsDropdown } from "./monitor-actions-dropdown";
import { MonitorStatusBadge } from "./monitor-status-badge";

interface MonitorListTableProps {
  monitors: Monitor[];
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function MonitorListTable({ monitors }: MonitorListTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border-2 border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-950/30">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="border-b-2 border-zinc-200 hover:bg-transparent dark:border-zinc-700">
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Name
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              URL
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Capabilities
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Last check
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Uptime
            </TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Latency
            </TableHead>
            <TableHead className="w-14 text-right text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {monitors.map((m) => (
            <TableRow key={m.id}>
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
                {formatWhen(m.lastCheckAt)}
              </TableCell>
              <TableCell className="text-zinc-700 dark:text-zinc-300">
                {formatPercent(m.uptimePercentage, 1)}
              </TableCell>
              <TableCell>{formatMilliseconds(m.lastResponseTimeMs)}</TableCell>
              <TableCell className="text-right">
                <MonitorActionsDropdown monitor={m} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
