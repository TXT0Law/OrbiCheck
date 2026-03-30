"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AlertSeverityBadgeProps {
  severity: "info" | "warning" | "critical";
  className?: string;
}

const SEVERITY_LABELS = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
} as const;

export function AlertSeverityBadge({ severity, className }: AlertSeverityBadgeProps) {
  if (severity === "critical") {
    return (
      <Badge variant="destructive" className={className} data-testid="alert-severity-critical">
        {SEVERITY_LABELS.critical}
      </Badge>
    );
  }

  if (severity === "warning") {
    return (
      <Badge
        variant="warning"
        className={cn("bg-amber-500 text-zinc-950", className)}
        data-testid="alert-severity-warning"
      >
        {SEVERITY_LABELS.warning}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className} data-testid="alert-severity-info">
      {SEVERITY_LABELS.info}
    </Badge>
  );
}
