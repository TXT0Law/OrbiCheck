"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getReportHistoryMessages } from "@/lib/i18n/report-history";
import type { ReportScheduleRun } from "@/shared/types/report";

interface ReportRunCardProps {
  run: ReportScheduleRun;
  language: "en" | "zh";
  selected?: boolean;
}

export function ReportRunCard({ run, language, selected = false }: ReportRunCardProps) {
  const messages = getReportHistoryMessages(language);
  const operations = run.operations;
  function formatDate(value: string | null): string {
    return value
      ? new Date(value).toLocaleString(language === "zh" ? "zh-TW" : "en")
      : messages.unknownTime;
  }

  return (
    <article
      className="min-w-0 space-y-3 rounded-md border p-4"
      aria-label={`${selected ? messages.selected : messages.run} ${run.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {selected && <h3 className="text-sm font-semibold">{messages.selected}</h3>}
        <Badge variant="secondary">{messages.statuses[run.status]}</Badge>
        <Badge variant={operations.reviewReason ? "destructive" : "secondary"}>
          {messages.states[operations.deliveryState]}
        </Badge>
      </div>
      <p className="break-all font-mono text-xs">{messages.run}: <code>{run.id}</code></p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{messages.started}</dt>
          <dd>{formatDate(run.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{messages.completed}</dt>
          <dd>{formatDate(run.completedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{messages.artifact}</dt>
          <dd>{messages.artifacts[operations.artifactState]}</dd>
        </div>
      </dl>
      <ul className="space-y-1 text-sm">
        {operations.channels.map((channel) => (
          <li key={channel.channel} className="break-words">
            {messages[channel.channel]}: {channel.acceptedCount} {messages.accepted}
            {" · "}{channel.failedCount} {messages.failed}
            {" · "}{channel.unknownCount} {messages.unknown}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{messages.actions[operations.deliveryState]}</p>
      {operations.artifactState === "completed" && operations.reportId && (
        <Link
          className="inline-block text-sm underline underline-offset-4"
          href={`/dashboard/reports/${encodeURIComponent(operations.reportId)}`}
        >
          {messages.report}
        </Link>
      )}
    </article>
  );
}
