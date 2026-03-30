"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useMonitorContentBaseline } from "@/lib/hooks/use-monitors";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";

interface MonitorSnapshotInfoProps {
  monitorId: string;
}

export function MonitorSnapshotInfo({ monitorId }: MonitorSnapshotInfoProps) {
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);
  const { data: baseline, isLoading } = useMonitorContentBaseline(monitorId);

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (!baseline?.contentHash) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.baselineTitle}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t.baselineEmpty}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.baselineTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{t.baselineDescription}</p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t.baselineSnapshotTime}</dt>
            <dd className="font-medium text-zinc-900 dark:text-white">
              {new Date(baseline.capturedAt).toLocaleString(t.dateLocale)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t.baselineSha256}</dt>
            <dd className="break-all font-mono text-xs text-zinc-800 dark:text-zinc-200">
              {baseline.contentHash}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
