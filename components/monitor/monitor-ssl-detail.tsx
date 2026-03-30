"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorSsl } from "@/lib/hooks/use-monitors";
import { cn } from "@/lib/utils";

interface MonitorSslDetailProps {
  monitorId: string;
}

export function MonitorSslDetail({ monitorId }: MonitorSslDetailProps) {
  const { data, isLoading, isError } = useMonitorSsl(monitorId);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
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

  const severityClass =
    data.severityLevel === "expired" || data.severityLevel === "critical"
      ? "border-red-300 dark:border-red-900"
      : data.severityLevel === "warn"
        ? "border-amber-300 dark:border-amber-800"
        : data.severityLevel === "unknown"
          ? "border-zinc-300 dark:border-zinc-700"
          : "";

  return (
    <Card className={cn("border-2 border-zinc-200 dark:border-zinc-700", severityClass)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Certificate</CardTitle>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
              data.severityLevel === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
              data.severityLevel === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
              (data.severityLevel === "critical" || data.severityLevel === "expired") &&
                "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
              data.severityLevel === "unknown" &&
                "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            )}
          >
            {data.severityLevel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Subject</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{data.subject}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Issuer</p>
            <p className="text-zinc-800 dark:text-zinc-200">{data.issuer}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Valid from</p>
            <p>{data.validFrom ? new Date(data.validFrom).toLocaleString() : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Valid to</p>
            <p>{data.validTo ? new Date(data.validTo).toLocaleString() : "—"}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Days remaining</p>
          <p
            className={cn(
              "text-2xl font-bold",
              data.isExpired && "text-red-600",
              !data.isExpired && data.isExpiringSoon && "text-amber-600",
              !data.isExpired && !data.isExpiringSoon && "text-emerald-600"
            )}
          >
            {data.daysRemaining ?? "—"}
          </p>
        </div>
        {(data.subjectAlternativeNames?.length ?? 0) > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Subject alternative names</p>
            <p className="text-zinc-700 dark:text-zinc-300">{data.subjectAlternativeNames.join(", ")}</p>
          </div>
        ) : null}
        {(data.chainSummary?.length ?? 0) > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Chain</p>
            <ul className="mt-1 space-y-1 text-zinc-700 dark:text-zinc-300">
              {data.chainSummary.map((c, i) => {
                const subj = c.subject ?? c.subjectDn ?? "";
                const iss = c.issuer ?? c.issuerDn ?? "";
                const vt = c.validTo ?? "";
                return (
                  <li key={i} className="rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700">
                    <span className="font-medium">{subj || "—"}</span>
                    <span className="text-muted-foreground"> · {iss || "—"}</span>
                    {vt ? (
                      <span className="block text-xs text-muted-foreground">
                        to {new Date(vt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Last checked:{" "}
          {data.lastCheckedAt ? new Date(data.lastCheckedAt).toLocaleString() : "—"}
        </p>
      </CardContent>
    </Card>
  );
}
