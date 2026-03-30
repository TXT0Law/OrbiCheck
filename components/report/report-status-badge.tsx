"use client";

import { Badge } from "@/components/ui/badge";
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
  return <Badge className={`border-transparent capitalize ${getStatusClass(status)}`}>{status}</Badge>;
}
