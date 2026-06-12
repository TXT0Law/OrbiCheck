"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useCreateReport } from "@/lib/hooks/use-reports";
import { useScanList } from "@/lib/hooks/use-scan-list";
import { useMonitors } from "@/lib/hooks/use-monitors";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import type { ReportFormat, ReportPeriod } from "@/shared/types/report";

interface ReportGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetScanId?: string;
}

const PERIOD_OPTIONS: ReportPeriod[] = ["24h", "7d", "30d", "90d"];
const FORMAT_OPTIONS: ReportFormat[] = ["pdf", "markdown", "html", "both", "all"];

export function ReportGenerateDialog({
  open,
  onOpenChange,
  presetScanId,
}: ReportGenerateDialogProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).reports;
  const { toast } = useToast();
  const createReport = useCreateReport();
  const scansQuery = useScanList({
    page: 1,
    size: 20,
    statusGroup: "completed",
    sortBy: "created_at_desc",
  });
  const monitorsQuery = useMonitors({ page: 1, limit: 50 });

  const scans = useMemo(() => scansQuery.data?.scans ?? [], [scansQuery.data?.scans]);
  const monitors = useMemo(() => monitorsQuery.data?.data ?? [], [monitorsQuery.data?.data]);

  const [scanId, setScanId] = useState("");
  const [includeMonitor, setIncludeMonitor] = useState(false);
  const [monitorId, setMonitorId] = useState("");
  const [monitorPeriod, setMonitorPeriod] = useState<ReportPeriod>("30d");
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    if (presetScanId) {
      setScanId(presetScanId);
      return;
    }
    if (!scanId && scans[0]) {
      setScanId(scans[0].id);
    }
  }, [open, presetScanId, scanId, scans]);

  useEffect(() => {
    if (!includeMonitor) {
      setMonitorId("");
      return;
    }
    if (!monitorId && monitors[0]) {
      setMonitorId(monitors[0].id);
    }
  }, [includeMonitor, monitorId, monitors]);

  const selectedScan = useMemo(
    () => scans.find((item) => item.id === scanId),
    [scanId, scans]
  );

  const titlePlaceholder = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    if (!selectedScan) {
      return messages.defaultReportTitle("target", date);
    }
    return messages.defaultReportTitle(selectedScan.domain, date);
  }, [messages, selectedScan]);

  async function handleSubmit() {
    if (!scanId) {
      toast({
        title: messages.scanRequiredTitle,
        description: messages.scanRequiredDescription,
        variant: "destructive",
      });
      return;
    }

    try {
      const created = await createReport.mutateAsync({
        scanId,
        monitorId: includeMonitor && monitorId ? monitorId : undefined,
        monitorPeriod,
        format,
        title: title.trim() || undefined,
      });
      toast({
        title: messages.reportQueuedTitle,
        description: messages.reportQueuedDescription(created.title),
      });
      onOpenChange(false);
      setTitle("");
    } catch (error) {
      const message = error instanceof Error ? error.message : messages.queueReportFallback;
      toast({
        title: messages.generationFailedTitle,
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{messages.generateDialogTitle}</DialogTitle>
          <DialogDescription>
            {messages.generateDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100" htmlFor="report-scan">
              {messages.scanLabel}
            </label>
            <select
              id="report-scan"
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              value={scanId}
              onChange={(event) => setScanId(event.target.value)}
            >
              <option value="">{messages.selectCompletedScan}</option>
              {scans.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {scan.domain} ({scan.createdAt.slice(0, 10)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              <input
                type="checkbox"
                checked={includeMonitor}
                onChange={(event) => setIncludeMonitor(event.target.checked)}
              />
              {messages.includeMonitorSummary}
            </label>

            {includeMonitor ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="report-monitor">
                    {messages.monitorLabel}
                  </label>
                  <select
                    id="report-monitor"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    value={monitorId}
                    onChange={(event) => setMonitorId(event.target.value)}
                  >
                    <option value="">{messages.selectMonitor}</option>
                    {monitors.map((monitor) => (
                      <option key={monitor.id} value={monitor.id}>
                        {monitor.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="report-period">
                    {messages.periodLabel}
                  </label>
                  <select
                    id="report-period"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    value={monitorPeriod}
                    onChange={(event) => setMonitorPeriod(event.target.value as ReportPeriod)}
                  >
                    {PERIOD_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100" htmlFor="report-format">
                {messages.formatLabel}
              </label>
              <select
                id="report-format"
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                value={format}
                onChange={(event) => setFormat(event.target.value as ReportFormat)}
              >
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100" htmlFor="report-title">
                {messages.titleLabel}
              </label>
              <Input
                id="report-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={titlePlaceholder}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createReport.isPending}>
            {messages.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={createReport.isPending || scans.length === 0}>
            {createReport.isPending ? messages.generating : messages.generateReport}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
