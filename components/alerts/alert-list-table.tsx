"use client";

import Link from "next/link";
import { BellRing, Mail, Radio, Webhook } from "lucide-react";

import { TimeAgo } from "@/components/common/time-ago";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AlertContentMessages } from "@/lib/i18n/alert-content";
import { cn } from "@/lib/utils";
import type { AlertEvent, Monitor } from "@/shared/types/monitor";

import { AlertSeverityBadge } from "./alert-severity-badge";

interface AlertListTableProps {
  alerts: AlertEvent[];
  monitorsById: Record<string, Monitor | undefined>;
  messages: AlertContentMessages;
  isLoading?: boolean;
  acknowledgingId?: string | null;
  onSelect: (alert: AlertEvent) => void;
  onAcknowledge: (alertId: string) => void;
}

const MOBILE_LOADING_CARD_COUNT = 4;

function renderChannelIcon(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized === "sse") return <Radio className="h-4 w-4" aria-hidden />;
  if (normalized === "webhook") return <Webhook className="h-4 w-4" aria-hidden />;
  if (normalized === "email") return <Mail className="h-4 w-4" aria-hidden />;
  return <BellRing className="h-4 w-4" aria-hidden />;
}

function formatAbsolute(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderStatusBadge(alert: AlertEvent, messages: AlertContentMessages) {
  const baseClassName =
    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium border";

  if (alert.suppressed) {
    return (
      <span
        className={cn(
          baseClassName,
          "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        )}
      >
        {messages.badges.suppressed}
      </span>
    );
  }

  if (alert.acknowledgedAt) {
    return (
      <span
        className={cn(
          baseClassName,
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        )}
      >
        {messages.badges.acknowledged}
      </span>
    );
  }

  return (
    <span
      className={cn(
        baseClassName,
        "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
      )}
    >
      {messages.badges.active}
    </span>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell>
            <Skeleton className="h-6 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-9 w-28" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function AlertListTable({
  alerts,
  monitorsById,
  messages,
  isLoading = false,
  acknowledgingId,
  onSelect,
  onAcknowledge,
}: AlertListTableProps) {
  return (
    <>
      <ul className="space-y-3 xl:hidden" data-testid="mobile-alert-list">
        {isLoading
          ? Array.from({ length: MOBILE_LOADING_CARD_COUNT }, (_, index) => (
              <li
                key={index}
                className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-24" />
              </li>
            ))
          : alerts.map((alert) => {
              const monitor = monitorsById[alert.monitorId];
              const isAcknowledging = acknowledgingId === alert.id;

              return (
                <li
                  key={alert.id}
                  className="min-w-0 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <AlertSeverityBadge severity={alert.severity} />
                    {renderStatusBadge(alert, messages)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {messages.columns.monitor}
                    </p>
                    {monitor ? (
                      <Link
                        href={`/dashboard/monitor/${alert.monitorId}`}
                        className="block break-words font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                      >
                        {monitor.displayName}
                      </Link>
                    ) : (
                      <p className="break-all text-sm text-muted-foreground">
                        {alert.monitorId}
                      </p>
                    )}
                  </div>
                  <p className="break-words text-sm text-foreground">
                    {alert.message}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {messages.columns.capability}
                      </p>
                      <p>{messages.capabilityMap[alert.capability]}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {messages.columns.time}
                      </p>
                      <span title={formatAbsolute(alert.createdAt)}>
                        <TimeAgo date={alert.createdAt} />
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {messages.columns.channels}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-zinc-500 dark:text-zinc-300">
                      {alert.dispatchedChannels.length > 0 ? (
                        alert.dispatchedChannels.map((channel) => (
                          <span
                            key={channel}
                            role="img"
                            title={channel}
                            aria-label={channel}
                          >
                            {renderChannelIcon(channel)}
                          </span>
                        ))
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelect(alert)}
                    >
                      {messages.actions.view}
                    </Button>
                    {!alert.acknowledgedAt ? (
                      <Button
                        size="sm"
                        onClick={() => onAcknowledge(alert.id)}
                        disabled={isAcknowledging}
                      >
                        {isAcknowledging
                          ? messages.actions.acknowledging
                          : messages.actions.acknowledge}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 xl:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50 dark:bg-zinc-900/70">
              <TableHead>{messages.columns.severity}</TableHead>
              <TableHead>{messages.columns.monitor}</TableHead>
              <TableHead>{messages.columns.capability}</TableHead>
              <TableHead>{messages.columns.message}</TableHead>
              <TableHead>{messages.columns.time}</TableHead>
              <TableHead>{messages.columns.channels}</TableHead>
              <TableHead>{messages.columns.status}</TableHead>
              <TableHead>{messages.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <LoadingRows /> : null}
            {!isLoading
              ? alerts.map((alert) => {
                  const monitor = monitorsById[alert.monitorId];
                  const isAcknowledging = acknowledgingId === alert.id;

                  return (
                    <TableRow
                      key={alert.id}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                      onClick={() => onSelect(alert)}
                    >
                      <TableCell>
                        <AlertSeverityBadge severity={alert.severity} />
                      </TableCell>
                      <TableCell>
                        {monitor ? (
                          <Link
                            href={`/dashboard/monitor/${alert.monitorId}`}
                            className="font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {monitor.displayName}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">{alert.monitorId}</span>
                        )}
                      </TableCell>
                      <TableCell>{messages.capabilityMap[alert.capability]}</TableCell>
                      <TableCell className="max-w-[320px] truncate" title={alert.message}>
                        {alert.message}
                      </TableCell>
                      <TableCell title={formatAbsolute(alert.createdAt)}>
                        <TimeAgo date={alert.createdAt} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-300">
                          {alert.dispatchedChannels.length > 0 ? (
                            alert.dispatchedChannels.map((channel) => (
                              <span key={channel} title={channel}>
                                {renderChannelIcon(channel)}
                              </span>
                            ))
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{renderStatusBadge(alert, messages)}</TableCell>
                      <TableCell>
                        {!alert.acknowledgedAt ? (
                          <Button
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              onAcknowledge(alert.id);
                            }}
                            disabled={isAcknowledging}
                          >
                            {isAcknowledging
                              ? messages.actions.acknowledging
                              : messages.actions.acknowledge}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
