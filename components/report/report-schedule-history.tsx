"use client";

import { useEffect, useRef } from "react";

import { ReportRunCard } from "@/components/report/report-run-card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import {
  useReportScheduleRun, useReportScheduleRuns,
} from "@/lib/hooks/use-report-schedules";
import { getReportHistoryMessages } from "@/lib/i18n/report-history";

interface ReportScheduleHistoryProps {
  scheduleId: string;
  scheduleName: string;
  runId: string | null;
  onClose: () => void;
  onRestoreFocus?: () => void;
}

export function ReportScheduleHistory({
  scheduleId, scheduleName, runId, onClose, onRestoreFocus,
}: ReportScheduleHistoryProps) {
  const language = useAppearanceLanguage();
  const messages = getReportHistoryMessages(language);
  const history = useReportScheduleRuns(scheduleId, true);
  const requested = useReportScheduleRun(scheduleId, runId, true);
  const selectedRef = useRef<HTMLDivElement>(null);
  const requestedRunId = requested.data?.id;

  useEffect(() => {
    if (requestedRunId) selectedRef.current?.focus();
  }, [requestedRunId]);

  function refresh() {
    void history.refetch();
    if (runId) void requested.refetch();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); }
        }}
        className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{messages.history}</DialogTitle>
          <DialogDescription className="break-words">{scheduleName}</DialogDescription>
        </DialogHeader>
        <Button className="justify-self-end" variant="outline" onClick={onClose}>{messages.close}</Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{messages.scope}</p>
          <Button
            variant="outline" size="sm" onClick={refresh}
            disabled={history.isFetching || requested.isFetching}
          >
            {messages.refresh}
          </Button>
        </div>
        {runId && (
          <div
            ref={selectedRef} tabIndex={-1} aria-live="polite"
            className="min-w-0 rounded-md focus:outline focus:outline-2 focus:outline-offset-2"
          >
            {requested.isLoading && <p role="status">{messages.loading}</p>}
            {requested.isError && (
              <div role="alert">
                <p>{messages.error} {messages.run}: <code className="break-all">{runId}</code></p>
                <Button variant="outline" onClick={() => void requested.refetch()}>
                  {messages.retry}
                </Button>
              </div>
            )}
            {requested.data && <ReportRunCard run={requested.data} language={language} selected />}
          </div>
        )}
        {history.isLoading ? <p role="status">{messages.loading}</p> : history.isError ? (
          <div role="alert">
            <p>{messages.error}</p>
            <Button variant="outline" onClick={() => void history.refetch()}>{messages.retry}</Button>
          </div>
        ) : history.data?.runs.length === 0 ? <p role="status">{messages.empty}</p> : (
          <div className="min-w-0 space-y-3">
            {history.data?.runs.filter((run) => run.id !== runId).map((run) => (
              <ReportRunCard key={run.id} run={run} language={language} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
