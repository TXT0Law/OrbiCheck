"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMonitorChecks } from "@/lib/hooks/use-monitors";

import { MonitorCheckErrorBadge } from "./monitor-check-error-badge";

interface MonitorChecksTableProps {
  monitorId: string;
}

export function MonitorChecksTable({ monitorId }: MonitorChecksTableProps) {
  const { data, isLoading } = useMonitorChecks(monitorId, { limit: 50, page: 1 });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading checks…</p>;
  }

  const rows = data?.data ?? [];

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No check history yet.</p>;
  }

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>OK</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Latency</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(c.checkedAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-foreground">{c.success ? "Yes" : "No"}</TableCell>
              <TableCell className="tabular-nums text-foreground">{c.statusCode ?? "—"}</TableCell>
              <TableCell className="tabular-nums text-foreground">
                {Math.round(c.responseTimeMs)} ms
              </TableCell>
              <TableCell>
                <MonitorCheckErrorBadge errorType={c.errorType} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
