"use client";

import { ExternalLink, Search } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";

import { MonitorActionsDropdown } from "./monitor-actions-dropdown";
import { useMonitorDetail } from "./monitor-detail-context";
import { MonitorStatusBadge } from "./monitor-status-badge";

export function MonitorDetailHeader() {
  const { monitor } = useMonitorDetail();

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{monitor.displayName}</h1>
          <MonitorStatusBadge status={monitor.status} />
        </div>
        <a
          href={monitor.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex max-w-full items-center gap-1 truncate text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          <span className="truncate">{monitor.url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <Link
          href={`/dashboard/scan?url=${encodeURIComponent(monitor.url)}`}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <Search className="h-3 w-3" />
          Run OSINT Scan
        </Link>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {monitor.enabledCapabilities.map((cap) => (
            <Badge key={cap} variant="outline" className="text-xs">
              {CAPABILITY_CONFIG[cap].shortLabel}
            </Badge>
          ))}
        </div>
        {monitor.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {monitor.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <MonitorActionsDropdown monitor={monitor} />
    </header>
  );
}
