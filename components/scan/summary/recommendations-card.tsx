"use client";

/**
 * Full recommendations list rendered on the Summary page (the executive card
 * only shows the top 3). Click navigates to the originating module's detail
 * page when the recommendation declares a `module` id; otherwise the row is
 * static text.
 *
 * Recommendations are produced by the shared backend service
 * `services/recommendations.py` so the wording stays bit-equal between this
 * card and the offline PDF/Markdown report (middleReport.md T0.3).
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModuleDetailHref } from "@/lib/constants/scan-module-routes";
import { cn } from "@/lib/utils";
import type { Recommendation, ScanDetail } from "@/shared/types/scan";

export interface RecommendationsCardProps {
  detail: ScanDetail;
}

const SEVERITY_BADGE_CLASS: Record<Recommendation["severity"], string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

const RUNNING_STATUSES: ReadonlyArray<ScanDetail["status"]> = [
  "pending",
  "running",
];

function emptyMessage(status: ScanDetail["status"]): string {
  if (RUNNING_STATUSES.includes(status)) {
    return "Recommendations will appear as the scan completes its modules.";
  }
  return "No actionable recommendations were produced for this scan.";
}

interface RecommendationRowProps {
  scanId: string;
  recommendation: Recommendation;
}

function RecommendationRow({ scanId, recommendation }: RecommendationRowProps) {
  const href = recommendation.module
    ? getModuleDetailHref(scanId, recommendation.module)
    : null;

  const inner = (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {recommendation.title}
        </h4>
        <Badge
          className={cn(
            "shrink-0 border-transparent capitalize",
            SEVERITY_BADGE_CLASS[recommendation.severity] ??
              SEVERITY_BADGE_CLASS.info,
          )}
        >
          {recommendation.severity}
        </Badge>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        {recommendation.description}
      </p>
      {href && (
        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
          View module detail →
        </p>
      )}
    </div>
  );

  const baseClasses =
    "block rounded-md border border-zinc-200 p-3 dark:border-zinc-800";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          baseClasses,
          "transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/40",
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={baseClasses}>{inner}</div>;
}

export function RecommendationsCard({ detail }: RecommendationsCardProps) {
  const recommendations = detail.recommendations ?? [];

  return (
    <Card data-testid="recommendations-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.length > 0 ? (
          <ul className="space-y-3">
            {recommendations.map((rec, idx) => (
              <li key={`${rec.severity}-${rec.title}-${idx}`}>
                <RecommendationRow scanId={detail.id} recommendation={rec} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {emptyMessage(detail.status)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
