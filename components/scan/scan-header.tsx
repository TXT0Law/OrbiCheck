"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Download, FileText } from "lucide-react";

import { ReportGenerateDialog } from "@/components/report/report-generate-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPageLabelFromPathname } from "@/lib/constants/scan-module-routes";
import { downloadJson, pickScanDetailExportSummary } from "@/lib/utils/export-json";
import type { ScanDetail } from "@/shared/types/scan";

interface ScanHeaderProps {
  detail: ScanDetail;
}

export function ScanHeader({ detail }: ScanHeaderProps) {
  const pathname = usePathname();
  const pageLabel = getPageLabelFromPathname(pathname);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const handleExportSummary = () => {
    const payload = pickScanDetailExportSummary(detail);
    const safeDomain = detail.domain.replace(/[^\w.-]+/g, "_");
    downloadJson(`scan-${detail.id}-${safeDomain}-summary.json`, payload);
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
