"use client";

import { useState } from "react";

import { ReportGenerateDialog } from "@/components/report/report-generate-dialog";
import { ReportListTable } from "@/components/report/report-list-table";
import { ReportScheduleDialog } from "@/components/report/report-schedule-dialog";
import { ReportScheduleList } from "@/components/report/report-schedule-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useReportSchedules } from "@/lib/hooks/use-report-schedules";
import { useReportList } from "@/lib/hooks/use-reports";
import { getDashboardMessages } from "@/lib/i18n/dashboard";

export default function ReportsPage() {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).reports;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const reportsQuery = useReportList({ page: 1, limit: 20 });
  const schedulesQuery = useReportSchedules();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {messages.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {messages.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScheduleDialogOpen(true)}>
            {messages.createSchedule}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>{messages.generateReport}</Button>
        </div>
      </div>

      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">{messages.reportsTab}</TabsTrigger>
          <TabsTrigger value="schedules">{messages.schedulesTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          {reportsQuery.isLoading ? (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                {messages.loadingReports}
              </CardContent>
            </Card>
          ) : reportsQuery.data?.reports.length ? (
            <ReportListTable reports={reportsQuery.data.reports} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">{messages.noReportsTitle}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {messages.noReportsDescription}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          {schedulesQuery.isLoading ? (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                {messages.loadingSchedules}
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
