"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface ScanResultCardProps {
  domain: string;
  score: number;
  duration: string;
  severity: SeverityCounts;
  reportHref: string;
}

function getScoreColor(score: number) {
  if (score >= 70) {
    return "text-red-600";
  }

  if (score >= 40) {
    return "text-yellow-600";
  }

  return "text-green-600";
}

export function ScanResultCard({ domain, score, duration, severity, reportHref }: ScanResultCardProps) {
  const safeReportHref = reportHref.startsWith("/dashboard/scan/") ? reportHref : "/dashboard/scan";

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{domain}</span>
          </div>
          <Badge className="border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">Completed</Badge>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Risk Score</p>
          <p className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}/100</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1 text-red-600">
            <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
            Critical: {severity.critical}
          </span>
          <span className="inline-flex items-center gap-1 text-orange-600">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-600" />
            High: {severity.high}
          </span>
          <span className="inline-flex items-center gap-1 text-yellow-600">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-600" />
            Medium: {severity.medium}
          </span>
          <span className="inline-flex items-center gap-1 text-blue-600">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
            Low: {severity.low}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Completed in {duration}</p>
          <Link
            href={safeReportHref}
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            View Full Report
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}