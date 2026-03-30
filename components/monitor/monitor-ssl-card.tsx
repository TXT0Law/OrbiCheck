"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorSsl } from "@/lib/hooks/use-monitors";

interface MonitorSslCardProps {
  monitorId: string;
}

export function MonitorSslCard({ monitorId }: MonitorSslCardProps) {
  const { data, isLoading, isError } = useMonitorSsl(monitorId);

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SSL certificate</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Unable to load SSL details. Use an https:// URL for certificate monitoring.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={
        data.isExpired
          ? "border-red-300 dark:border-red-900"
          : data.isExpiringSoon
            ? "border-amber-300 dark:border-amber-800"
            : ""
      }
    >
      <CardHeader>
        <CardTitle>SSL certificate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Subject</span>
          <span className="text-right font-medium text-zinc-900 dark:text-white">
            {data.subject}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Issuer</span>
          <span className="text-right text-zinc-800 dark:text-zinc-200">{data.issuer}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Valid to</span>
          <span className="text-right">
            {data.validTo ? new Date(data.validTo).toLocaleDateString() : "—"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Days remaining</span>
          <span
            className={`font-semibold ${
              data.isExpired
                ? "text-red-600"
                : data.isExpiringSoon
                  ? "text-amber-600"
                  : "text-emerald-600"
            }`}
          >
            {data.daysRemaining ?? "—"}
          </span>
        </div>
        <p className="pt-2 text-xs text-muted-foreground">
          Last checked:{" "}
          {data.lastCheckedAt ? new Date(data.lastCheckedAt).toLocaleString() : "—"}
        </p>
      </CardContent>
    </Card>
  );
}
