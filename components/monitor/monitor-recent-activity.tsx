"use client";

import { ArrowRight, CheckCircle, FileCode, XCircle } from "lucide-react";
import Link from "next/link";

import { TimeAgo } from "@/components/common/time-ago";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMonitorChecks } from "@/lib/hooks/use-monitors";
import { formatMilliseconds } from "@/lib/utils/monitor-formatters";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";
import type { MonitorCapability, MonitorCheck } from "@/shared/types/monitor";

import { MonitorCheckErrorBadge } from "./monitor-check-error-badge";

const RECENT_LIMIT = 10;

export function MonitorRecentActivity({ monitorId }: { monitorId: string }) {
  const { data, isLoading, error } = useMonitorChecks(monitorId, { limit: RECENT_LIMIT });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load recent checks.</p>
        </CardContent>
      </Card>
    );
  }

  const checks: MonitorCheck[] = data?.data ?? [];

  if (checks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No checks recorded yet. Checks will appear here once monitoring begins.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent Checks</CardTitle>
        <Link
          href={`/dashboard/monitor/${monitorId}/uptime`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Status</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Capabilities</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => (
              <TableRow key={check.id}>
                <TableCell>
                  {check.success ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </TableCell>
                <TableCell className="text-sm text-zinc-700 dark:text-zinc-300">
                  <TimeAgo date={check.checkedAt} />
                </TableCell>
                <TableCell className="text-sm">
                  {check.statusCode != null ? (
                    <span className="mr-2 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      {check.statusCode}
                    </span>
                  ) : null}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMilliseconds(check.responseTimeMs)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {check.evaluatedCapabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-[10px]">
                        {CAPABILITY_CONFIG[cap as MonitorCapability]?.shortLabel ?? cap}
                      </Badge>
                    ))}
                    {check.contentChanged ? (
                      <Badge variant="secondary" className="text-[10px]">
                        <FileCode className="mr-0.5 h-2.5 w-2.5" />
                        Changed
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {check.errorType ? (
                    <MonitorCheckErrorBadge
                      errorType={check.errorType}
                      errorMessage={check.errorMessage}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">OK</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
