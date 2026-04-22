"use client";

import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMonitorDnsChanges,
  useMonitorDnsRecords,
} from "@/lib/hooks/use-monitor-dns";
import type {
  MonitorDnsChange,
  MonitorDnsRecord,
} from "@/shared/types/monitor";

interface MonitorDnsHistoryProps {
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

const RECORD_TYPE_BADGE_CLASS =
  "inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";

function valueList(values: string[] | null | undefined) {
  if (!values || values.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <ul className="space-y-0.5">
      {values.map((v) => (
        <li
          key={v}
          className="break-all font-mono text-xs text-zinc-800 dark:text-zinc-200"
        >
          {v}
        </li>
      ))}
    </ul>
  );
}

function MonitorDnsCurrentRecords({
  records,
  isLoading,
  isError,
}: {
  records: MonitorDnsRecord[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Failed to load current DNS records.
      </p>
    );
  }
  const list = records ?? [];
  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No DNS records have been observed yet. The first probe will populate
        the snapshot.
      </p>
    );
  }
  // Group by record type for compact display.
  const grouped = list.reduce<Record<string, MonitorDnsRecord[]>>(
    (acc, r) => {
      const key = r.recordType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    },
    {},
  );
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([type, rows]) => (
        <div
          key={type}
          className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className={RECORD_TYPE_BADGE_CLASS}>{type}</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Observed {formatDateTime(rows[0]?.observedAt)}
            </span>
          </div>
          {valueList(rows.flatMap((r) => r.values))}
        </div>
      ))}
    </div>
  );
}

function MonitorDnsChangeRow({ change }: { change: MonitorDnsChange }) {
  const added = change.addedValues ?? [];
  const removed = change.removedValues ?? [];
  return (
    <li className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className={RECORD_TYPE_BADGE_CLASS}>{change.recordType}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDateTime(change.detectedAt)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Added ({added.length})
          </p>
          {added.length > 0 ? (
            <ul className="space-y-0.5">
              {added.map((v) => (
                <li
                  key={v}
                  className="break-all font-mono text-xs text-emerald-800 dark:text-emerald-200"
                >
                  {v}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
            Removed ({removed.length})
          </p>
          {removed.length > 0 ? (
            <ul className="space-y-0.5">
              {removed.map((v) => (
                <li
                  key={v}
                  className="break-all font-mono text-xs text-red-800 dark:text-red-200"
                >
                  {v}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </div>
      </div>
    </li>
  );
}

export function MonitorDnsHistory({ monitorId }: MonitorDnsHistoryProps) {
  const records = useMonitorDnsRecords(monitorId);
  const changes = useMonitorDnsChanges(monitorId, { page: 1, limit: 50 });

  const sortedChanges = useMemo(() => {
    const list = changes.data ?? [];
    return [...list].sort(
      (a, b) =>
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
  }, [changes.data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current DNS records</CardTitle>
        </CardHeader>
        <CardContent>
          <MonitorDnsCurrentRecords
            records={records.data}
            isLoading={records.isLoading}
            isError={records.isError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent DNS changes</CardTitle>
        </CardHeader>
        <CardContent>
          {changes.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : changes.isError ? (
            <p className="text-sm text-muted-foreground">
              Failed to load DNS change history.
            </p>
          ) : sortedChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No DNS changes have been recorded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {sortedChanges.map((change) => (
                <MonitorDnsChangeRow key={change.id} change={change} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
