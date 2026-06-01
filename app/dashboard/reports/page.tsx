"use client";

import { useState } from "react";

import { ReportGenerateDialog } from "@/components/report/report-generate-dialog";
import { ReportListTable } from "@/components/report/report-list-table";
import { ReportScheduleDialog } from "@/components/report/report-schedule-dialog";
import { ReportScheduleList } from "@/components/report/report-schedule-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReportSchedules } from "@/lib/hooks/use-report-schedules";
import { useReportList } from "@/lib/hooks/use-reports";

export default function ReportsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const reportsQuery = useReportList({ page: 1, limit: 20 });
  const schedulesQuery = useReportSchedules();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate server-side security assessment reports from completed scans.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScheduleDialogOpen(true)}>
            Create Schedule
          </Button>
          <Button onClick={() => setDialogOpen(true)}>Generate Report</Button>
        </div>
      </div>

      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          {reportsQuery.isLoading ? (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">Loading reports...</CardContent>
            </Card>
          ) : reportsQuery.data?.reports.length ? (
            <ReportListTable reports={reportsQuery.data.reports} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">No reports yet</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Create your first report from a completed scan to get a downloadable PDF, HTML, or Markdown summary.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          {schedulesQuery.isLoading ? (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                Loading schedules...
              </CardContent>
            </Card>
          ) : (
            <ReportScheduleList schedules={schedulesQuery.data?.schedules ?? []} />
          )}
        </TabsContent>
      </Tabs>

      <ReportGenerateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <ReportScheduleDialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen} />
    </div>
  );
}
