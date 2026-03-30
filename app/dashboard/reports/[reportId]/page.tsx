"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ReportPreview } from "@/components/report/report-preview";
import { ReportStatusBadge } from "@/components/report/report-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { downloadReport } from "@/lib/api/reports";
import { useDeleteReport, useReport, useReportPreview } from "@/lib/hooks/use-reports";

interface ReportDetailPageProps {
  params: {
    reportId: string;
  };
}

export default function ReportDetailPage({ params }: ReportDetailPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const reportQuery = useReport(params.reportId);
  const deleteReport = useDeleteReport();
  const previewQuery = useReportPreview(
    params.reportId,
    reportQuery.data?.status === "completed"
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    if (!reportQuery.data) {
      return;
    }
    try {
      await deleteReport.mutateAsync(reportQuery.data.id);
      toast({
        title: "Report deleted",
        description: `"${reportQuery.data.title}" was removed.`,
      });
      router.push("/dashboard/reports");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete the report.";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  if (reportQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading report...</p>;
  }

  if (!reportQuery.data) {
    return <p className="text-sm text-muted-foreground">Report not found.</p>;
  }

  const report = reportQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/reports" className="text-sm text-muted-foreground hover:underline">
            Back to reports
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {report.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void downloadReport(report.id, "markdown")}
            disabled={report.status !== "completed"}
          >
            Download Markdown
          </Button>
          <Button
            variant="outline"
            onClick={() => void downloadReport(report.id, "pdf")}
            disabled={report.status !== "completed"}
          >
            Download PDF
          </Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Status</p>
            <ReportStatusBadge status={report.status} />
          </div>
          <div>
            <p className="text-muted-foreground">Format</p>
            <p className="capitalize text-zinc-900 dark:text-zinc-100">{report.format}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="text-zinc-900 dark:text-zinc-100">{report.createdAt}</p>
          </div>
        </CardContent>
      </Card>

      {report.errorMessage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-red-600">Generation Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-700 dark:text-zinc-300">
            {report.errorMessage}
          </CardContent>
        </Card>
      ) : null}

      {previewQuery.data?.contentMd ? (
        <ReportPreview content={previewQuery.data.contentMd} />
      ) : (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            {report.status === "completed"
              ? "Preview is unavailable for this report."
              : "Markdown preview will appear when generation finishes."}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete Report"
        description={`Are you sure you want to delete "${report.title}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => void handleDelete()}
        isLoading={deleteReport.isPending}
      />
    </div>
  );
}
