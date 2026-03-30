"use client";

import { AlertTriangle, CheckCircle, HelpCircle, Shield, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitorSsl } from "@/lib/hooks/use-monitors";
import { cn } from "@/lib/utils";

interface MonitorSslSeverityCardProps {
  monitorId: string;
}

const SEVERITY_CONFIG = {
  ok: {
    icon: CheckCircle,
    label: "Certificate Valid",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    advice: "No action required. Certificate is valid and not expiring soon.",
  },
  warn: {
    icon: AlertTriangle,
    label: "Expiring Soon",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    advice:
      "Certificate will expire within the warning threshold. Plan renewal soon to avoid downtime.",
  },
  critical: {
    icon: XCircle,
    label: "Expiring Imminently",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    advice:
      "Certificate is about to expire. Renew immediately to prevent service disruption and browser warnings.",
  },
  expired: {
    icon: XCircle,
    label: "Certificate Expired",
    color: "text-red-700",
    bg: "bg-red-100",
    border: "border-red-300",
    advice:
      "Certificate has expired. Users will see security warnings. Renew and deploy a new certificate immediately.",
  },
  unknown: {
    icon: HelpCircle,
    label: "SSL status unknown",
    color: "text-zinc-600",
    bg: "bg-zinc-50",
    border: "border-zinc-200",
    advice:
      "No probe data yet, the last check failed, or dates could not be read. Run a check or use Live probe if available.",
  },
} as const;

export function MonitorSslSeverityCard({ monitorId }: MonitorSslSeverityCardProps) {
  const { data: ssl, isLoading } = useMonitorSsl(monitorId);

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  if (!ssl) {
    return (
      <Card>
        <CardContent className="py-7">
          <p className="text-sm leading-relaxed text-muted-foreground">
            No SSL data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const severity =
    SEVERITY_CONFIG[ssl.severityLevel] ?? SEVERITY_CONFIG.unknown;
  const Icon = severity.icon;

  return (
    <Card className={cn("border", severity.border, severity.bg, "dark:border-opacity-60")}>
      <CardContent className="py-7">
        <div className="flex items-start gap-5">
          <div
            className={cn(
              "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10",
              severity.bg
            )}
          >
            <Icon className={cn("h-5 w-5", severity.color)} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
              <h3 className={cn("text-base font-semibold leading-snug", severity.color)}>{severity.label}</h3>
              <Badge variant="outline" className="w-fit shrink-0 text-xs font-normal">
                {ssl.daysRemaining != null ? `${ssl.daysRemaining} days remaining` : "—"}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{severity.advice}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/5 pt-4 text-xs text-muted-foreground dark:border-white/10">
              <span>
                <strong className="text-zinc-700 dark:text-zinc-300">Issuer:</strong> {ssl.issuer}
              </span>
              <span>
                <strong className="text-zinc-700 dark:text-zinc-300">Valid:</strong> {ssl.validFrom} →{" "}
                {ssl.validTo}
              </span>
              {(ssl.subjectAlternativeNames?.length ?? 0) > 0 ? (
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  <strong className="text-zinc-700 dark:text-zinc-300">SANs:</strong>{" "}
                  {ssl.subjectAlternativeNames.length} entries
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
