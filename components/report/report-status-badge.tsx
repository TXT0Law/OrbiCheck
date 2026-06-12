"use client";

import { Badge } from "@/components/ui/badge";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import type { ReportStatus } from "@/shared/types/report";

interface ReportStatusBadgeProps {
  status: ReportStatus;
}

function getStatusClass(status: ReportStatus): string {
  if (status === "completed") {
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
  }
  if (status === "failed") {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  }
  if (status === "generating") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
  }
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
}

export function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).reports;
  const labels: Record<ReportStatus, string> = {
    completed: messages.statusCompleted,
    failed: messages.statusFailed,
    generating: messages.statusGenerating,
    pending: messages.statusPending,
  };

  return (
    <Badge className={`border-transparent capitalize ${getStatusClass(status)}`}>
      {labels[status]}
    </Badge>
  );
}
