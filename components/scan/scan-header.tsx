"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Download, FileSpreadsheet, FileText, TrendingUp } from "lucide-react";

import { ReportGenerateDialog } from "@/components/report/report-generate-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getScanFullExport } from "@/lib/api/scans";
import { getPageLabelFromPathname } from "@/lib/constants/scan-module-routes";
import { downloadCsv, pickScanModuleCsvRows } from "@/lib/utils/export-csv";
import {
  downloadJson,
  pickScanDetailExportSummary,
  pickScanFullExport,
} from "@/lib/utils/export-json";
import type { ScanDetail } from "@/shared/types/scan";

interface ScanHeaderProps {
  detail: ScanDetail;
}

export function ScanHeader({ detail }: ScanHeaderProps) {
  const pathname = usePathname();
  const pageLabel = getPageLabelFromPathname(pathname);
  const { toast } = useToast();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [fullExportLoading, setFullExportLoading] = useState(false);

  const safeDomain = detail.domain.replace(/[^\w.-]+/g, "_");

  const handleExportSummary = () => {
    const payload = pickScanDetailExportSummary(detail);
    downloadJson(`scan-${detail.id}-${safeDomain}-summary.json`, payload);
  };

  const handleExportFull = async () => {
    if (fullExportLoading) {
      return;
    }
    setFullExportLoading(true);
    try {
      const full = await getScanFullExport(detail.id);
      const payload = pickScanFullExport(detail, full);
      downloadJson(`scan-${detail.id}-${safeDomain}-full.json`, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not export full data.";
      toast({
        title: "Export failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setFullExportLoading(false);
    }
  };

  const handleExportCsv = () => {
    const rows = pickScanModuleCsvRows(detail);
    downloadCsv(`scan-${detail.id}-${safeDomain}-modules.csv`, rows);
  };

  return (
    <>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link href="/dashboard/scan" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Scan
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium text-zinc-700 dark:text-zinc-200">{detail.domain}</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span>{pageLabel}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{pageLabel}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{detail.url}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/scan/${detail.id}/trend`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <TrendingUp className="h-4 w-4" aria-hidden />
              Trend
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setReportDialogOpen(true)}
              disabled={detail.status !== "completed"}
            >
              <FileText className="h-4 w-4" aria-hidden />
              Generate Report
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExportSummary}>
              <Download className="h-4 w-4" aria-hidden />
              Export summary (JSON)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleExportFull()}
              disabled={fullExportLoading}
            >
              <Download className="h-4 w-4" aria-hidden />
              {fullExportLoading ? "Exporting..." : "Export full (JSON)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExportCsv}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Badge
              className={`border-transparent ${
                detail.status === "completed"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                  : detail.status === "running" || detail.status === "pending"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                    : detail.status === "cancelled"
                      ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
              }`}
            >
              {detail.status}
            </Badge>
          </div>
        </div>
      </header>
      <ReportGenerateDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        presetScanId={detail.id}
      />
    </>
  );
}
