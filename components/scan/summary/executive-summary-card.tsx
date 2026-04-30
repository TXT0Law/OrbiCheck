"use client";

/**
 * Top-of-page card that gives a one-glance verdict for the scan: a large score
 * gauge, a one-sentence verdict, and the top 3 recommendations as call-to-action
 * buttons.
 *
 * Verdict thresholds and "Top 3" selection are spelled out in middleReport.md
 * T1.2; the recommendations source is shared with the offline PDF/MD report
 * (see backend `services/recommendations.py`).
 */

import Link from "next/link";

import { ScoreGauge } from "@/components/scan/charts/score-gauge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getModuleDetailHref } from "@/lib/constants/scan-module-routes";
import { cn } from "@/lib/utils";
import type { Recommendation, ScanDetail, SeverityCounts } from "@/shared/types/scan";

export interface ExecutiveSummaryCardProps {
  detail: ScanDetail;
}

const TOP_ACTION_LIMIT = 3;
const SEVERITY_RANK: Record<Recommendation["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const ACTION_BADGE_CLASS: Record<Recommendation["severity"], string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

function severityHasUrgentBuckets(severity: SeverityCounts): boolean {
  return severity.critical > 0 || severity.high > 0;
}

function buildVerdict(
  status: ScanDetail["status"],
  score: number | null | undefined,
  severity: SeverityCounts,
): string {
  if (status === "pending" || status === "running") {
    return "Scan in progress — verdict will appear once modules finish.";
  }
  if (status === "failed" || status === "cancelled") {
    return "Scan ended early — partial findings shown below.";
  }
  if (typeof score !== "number") {
    return "No headline score could be derived; review category cards for context.";
  }
  if (score >= 80) {
    return "Strong external posture — only minor opportunities remain.";
  }
  if (score >= 70) {
    return "Good baseline with a few minor gaps to close.";
  }
  if (score >= 50) {
    return "Notable issues — prioritise the top recommendations.";
  }
  if (severityHasUrgentBuckets(severity)) {
    return "Significant exposure — at least one critical or high-severity finding requires action.";
  }
  return "Significant exposure — multiple weaknesses warrant attention.";
}

function selectTopActions(
  recommendations: Recommendation[] | undefined,
): Recommendation[] {
  if (!recommendations || recommendations.length === 0) {
    return [];
  }
  return [...recommendations]
    .sort((a, b) => {
      const aRank = SEVERITY_RANK[a.severity] ?? SEVERITY_RANK.info;
      const bRank = SEVERITY_RANK[b.severity] ?? SEVERITY_RANK.info;
      return aRank - bRank;
    })
    .slice(0, TOP_ACTION_LIMIT);
}

interface TopActionButtonProps {
  scanId: string;
  recommendation: Recommendation;
}

function TopActionButton({ scanId, recommendation }: TopActionButtonProps) {
  const href = recommendation.module
    ? getModuleDetailHref(scanId, recommendation.module)
    : null;

  const badge = (
    <Badge
      className={cn(
        "shrink-0 border-transparent capitalize",
        ACTION_BADGE_CLASS[recommendation.severity] ?? ACTION_BADGE_CLASS.info,
      )}
    >
      {recommendation.severity}
    </Badge>
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {recommendation.title}
        </p>
        {badge}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
        {recommendation.description}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-md border border-zinc-200 p-3 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/40"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      {body}
    </div>
  );
}

export function ExecutiveSummaryCard({ detail }: ExecutiveSummaryCardProps) {
  const score = detail.securityScore;
  const severity = detail.severity;
  const verdict = buildVerdict(detail.status, score, severity);
  const topActions = selectTopActions(detail.recommendations);
  const isUrgent = severityHasUrgentBuckets(severity);

  return (
    <Card
      data-testid="executive-summary-card"
      data-urgent={isUrgent ? "true" : "false"}
      className={cn(
        "border-2",
        isUrgent
          ? "border-red-500 dark:border-red-500/70"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <CardContent className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[160px_1fr]">
        <div className="flex items-center justify-center md:justify-start">
          <ScoreGauge
            score={score ?? null}
            size="lg"
            label="Security score"
            caption="0–100, higher is better"
          />
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Verdict
            </p>
            <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {verdict}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Top actions
            </p>
            {topActions.length > 0 ? (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {topActions.map((rec, idx) => (
                  <li key={`${rec.severity}-${rec.title}-${idx}`}>
                    <TopActionButton scanId={detail.id} recommendation={rec} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No prioritised actions at this point.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
