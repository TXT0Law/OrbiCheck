"use client";

import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ReportStatusBadge } from "@/components/report/report-status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { downloadReport } from "@/lib/api/reports";
import { useDeleteReport } from "@/lib/hooks/use-reports";
import type { ReportDownloadFormat, ReportListItem } from "@/shared/types/report";

interface ReportListTableProps {
  reports: ReportListItem[];
}

/**
 * Mirror of ``backend/app/services/report_service.py`` enabled-format sets.
 * Keep aligned when extending ``ReportFormat`` so the UI does not surface a
 * download button for an artifact that the worker never produced.
 */
const FORMAT_AVAILABILITY: Record<ReportListItem["format"], ReportDownloadFormat[]> = {
  pdf: ["pdf", "markdown"],
  markdown: ["markdown"],
  html: ["markdown", "html"],
  both: ["pdf", "markdown"],
  all: ["pdf", "markdown", "html"],
};

function isFormatAvailable(
  reportFormat: ReportListItem["format"],
  candidate: ReportDownloadFormat,
): boolean {
  return FORMAT_AVAILABILITY[reportFormat]?.includes(candidate) ?? false;
}

function formatBytes(value: number | null): string {
  if (!value || value <= 0) {
    return "-";
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function ReportListTable({ reports }: ReportListTableProps) {
  const { toast } = useToast();
  const deleteReportMutation = useDeleteReport();
  const [deleting, setDeleting] = useState<ReportListItem | null>(null);

  async function handleDelete() {
    if (!deleting) {
      return;
    }
    try {
      await deleteReportMutation.mutateAsync(deleting.id);
      toast({
        title: "Report deleted",
        description: `"${deleting.title}" was removed.`,
      });
      setDeleting(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete the report.";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  async function handleDownload(reportId: string, format: ReportDownloadFormat) {
    try {
      await downloadReport(reportId, format);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed.";
      toast({
        title: "Download failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/reports/${report.id}`}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {report.title}
                  </Link>
                </TableCell>
                <TableCell>{report.scanDomain ?? "-"}</TableCell>
                <TableCell className="capitalize">{report.format}</TableCell>
                <TableCell>
                  <ReportStatusBadge status={report.status} />
                </TableCell>
                <TableCell>{formatBytes(report.fileSizeBytes)}</TableCell>
                <TableCell>{report.createdAt.slice(0, 10)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDownload(report.id, "markdown")}
                      disabled={
                        report.status !== "completed" ||
                        !isFormatAvailable(report.format, "markdown")
                      }
                    >
                      MD
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDownload(report.id, "pdf")}
                      disabled={
                        report.status !== "completed" ||
                        !isFormatAvailable(report.format, "pdf")
                      }
                    >
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDownload(report.id, "html")}
                      disabled={
                        report.status !== "completed" ||
                        !isFormatAvailable(report.format, "html")
                      }
                    >
                      HTML
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleting(report)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        title="Delete Report"
        description={`Are you sure you want to delete "${deleting?.title ?? "this report"}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
        isLoading={deleteReportMutation.isPending}
      />
    </>
  );
}
