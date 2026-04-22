"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorCtEntries } from "@/lib/hooks/use-monitor-ct";
import type { MonitorCtEntry } from "@/shared/types/monitor";

interface MonitorCtHistoryProps {
  monitorId: string;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function shortHex(value: string | null, max = 16): string {
  if (!value) return "—";
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function MonitorCtRow({ entry }: { entry: MonitorCtEntry }) {
  const violation = entry.pinViolation;
  return (
    <li
      className={`rounded-md border p-3 text-sm ${
        violation
          ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900 dark:text-white">
            {entry.commonName || entry.hostname}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {entry.issuerName || "Unknown issuer"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Observed {formatDateTime(entry.observedAt)}
          </span>
          {violation ? (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-200">
              Pin violation
            </span>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Serial</dt>
          <dd
            className="truncate font-mono text-zinc-800 dark:text-zinc-200"
            title={entry.serialNumber}
          >
            {shortHex(entry.serialNumber, 18)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Leaf SHA-256</dt>
          <dd
            className="truncate font-mono text-zinc-800 dark:text-zinc-200"
            title={entry.leafSha256 ?? ""}
          >
            {shortHex(entry.leafSha256, 18)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Not before</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {formatDateTime(entry.notBefore)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Not after</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">
            {formatDateTime(entry.notAfter)}
          </dd>
        </div>
      </dl>
      {entry.crtshId ? (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          crt.sh:{" "}
          <a
            href={`https://crt.sh/?id=${encodeURIComponent(entry.crtshId)}`}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            #{entry.crtshId}
          </a>
        </p>
      ) : null}
    </li>
  );
}

export function MonitorCtHistory({ monitorId }: MonitorCtHistoryProps) {
  const entries = useMonitorCtEntries(monitorId, { page: 1, limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent CT log entries</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : entries.isError ? (
          <p className="text-sm text-muted-foreground">
            Failed to load CT log entries.
          </p>
        ) : !entries.data || entries.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No CT log entries observed yet. crt.sh is polled at a low cadence
            (rate-limited) — new certificates may take a few minutes to
            surface.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.data.map((entry) => (
              <MonitorCtRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
