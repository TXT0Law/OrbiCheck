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
import { useCreateReport } from "@/lib/hooks/use-reports";
import { useScanList } from "@/lib/hooks/use-scan-list";
import { useMonitors } from "@/lib/hooks/use-monitors";
import type { ReportFormat, ReportPeriod } from "@/shared/types/report";

interface ReportGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetScanId?: string;
}

const PERIOD_OPTIONS: ReportPeriod[] = ["24h", "7d", "30d", "90d"];
const FORMAT_OPTIONS: ReportFormat[] = ["pdf", "markdown", "both"];

export function ReportGenerateDialog({
  open,
  onOpenChange,
  presetScanId,
}: ReportGenerateDialogProps) {
  const { toast } = useToast();
  const createReport = useCreateReport();
  const scansQuery = useScanList({
    page: 1,
    size: 20,
    statusGroup: "completed",
    sortBy: "created_at_desc",
  });
  const monitorsQuery = useMonitors({ page: 1, limit: 50 });

  const scans = scansQuery.data?.scans ?? [];
  const monitors = monitorsQuery.data?.data ?? [];

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
      return `Security Report - target - ${date}`;
    }
    return `Security Report - ${selectedScan.domain} - ${date}`;
  }, [selectedScan]);

  async function handleSubmit() {
    if (!scanId) {
      toast({
        title: "Scan required",
        description: "Please select a completed scan first.",
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
        title: "Report queued",
        description: `"${created.title}" is being generated.`,
      });
      onOpenChange(false);
      setTitle("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to queue report.";
      toast({
        title: "Generation failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Report</DialogTitle>
          <DialogDescription>
            Create a server-side security assessment report from a completed scan and optional monitor data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100" htmlFor="report-scan">
              Scan
            </label>
            <select
              id="report-scan"
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              value={scanId}
              onChange={(event) => setScanId(event.target.value)}
            >
              <option value="">Select a completed scan</option>
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
              Include monitor summary
            </label>

            {includeMonitor ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="report-monitor">
                    Monitor
                  </label>
                  <select
                    id="report-monitor"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    value={monitorId}
                    onChange={(event) => setMonitorId(event.target.value)}
                  >
                    <option value="">Select a monitor</option>
                    {monitors.map((monitor) => (
                      <option key={monitor.id} value={monitor.id}>
                        {monitor.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="report-period">
                    Period
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
                Format
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
                Title
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
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={createReport.isPending || scans.length === 0}>
            {createReport.isPending ? "Generating..." : "Generate Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
