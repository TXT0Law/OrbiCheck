"use client";

import Link from "next/link";
import { BellRing, ExternalLink, Mail, Radio, Webhook, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AlertContentMessages } from "@/lib/i18n/alert-content";
import type { AlertEvent, Monitor } from "@/shared/types/monitor";

import { AlertSeverityBadge } from "./alert-severity-badge";

interface AlertDetailSheetProps {
  alert: AlertEvent | null;
  monitor?: Monitor;
  open: boolean;
  messages: AlertContentMessages;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function renderChannelIcon(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized === "sse") {
    return <Radio className="h-4 w-4" aria-hidden />;
  }
  if (normalized === "webhook") {
    return <Webhook className="h-4 w-4" aria-hidden />;
  }
  if (normalized === "email") {
    return <Mail className="h-4 w-4" aria-hidden />;
  }
  return <BellRing className="h-4 w-4" aria-hidden />;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
      <div className="text-sm text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

export function AlertDetailSheet({
  alert,
  monitor,
  open,
  messages,
  onOpenChange,
}: AlertDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-0">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <SheetTitle>{messages.drawer.title}</SheetTitle>
              <SheetDescription>{messages.drawer.description}</SheetDescription>
            </div>
            <SheetClose asChild>
              <Button variant="outline" size="sm" aria-label={messages.actions.close}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </SheetClose>
          </div>
          {alert ? <AlertSeverityBadge severity={alert.severity} /> : null}
        </SheetHeader>

        {alert ? (
          <div className="space-y-6 p-6">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{alert.message}</p>
              {monitor ? (
                <Link
                  href={`/dashboard/monitor/${alert.monitorId}`}
                  className="mt-3 inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  {monitor.displayName}
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </div>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                {messages.drawer.details}
              </h3>
              <DetailRow
                label={messages.columns.monitor}
                value={monitor ? monitor.displayName : alert.monitorId}
              />
              <DetailRow
                label={messages.columns.capability}
                value={messages.capabilityMap[alert.capability]}
              />
              <DetailRow label={messages.drawer.eventType} value={alert.eventType} />
              <DetailRow label={messages.drawer.actualValue} value={alert.actualValue} />
              <DetailRow label={messages.drawer.createdAt} value={formatDateTime(alert.createdAt)} />
              <DetailRow
                label={messages.drawer.resolvedAt}
                value={alert.resolvedAt ? formatDateTime(alert.resolvedAt) : messages.drawer.never}
              />
              <DetailRow
                label={messages.drawer.acknowledgedAt}
                value={
                  alert.acknowledgedAt
                    ? formatDateTime(alert.acknowledgedAt)
                    : messages.drawer.never
                }
              />
              <DetailRow
                label={messages.drawer.acknowledgedBy}
                value={alert.acknowledgedBy ?? "—"}
              />
              <DetailRow
                label={messages.drawer.suppressReason}
                value={alert.suppressReason ?? "—"}
              />
              <DetailRow
                label={messages.drawer.channels}
                value={
                  <div className="flex flex-wrap gap-2">
                    {alert.dispatchedChannels.length > 0 ? (
                      alert.dispatchedChannels.map((channel) => (
                        <span
                          key={channel}
                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                        >
                          {renderChannelIcon(channel)}
                          {channel}
                        </span>
                      ))
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                }
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                {messages.drawer.thresholdConfig}
              </h3>
              {Object.keys(alert.thresholdConfig).length > 0 ? (
                <pre
                  className={cn(
                    "overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  )}
                >
                  {JSON.stringify(alert.thresholdConfig, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {messages.drawer.noThresholdConfig}
                </p>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
