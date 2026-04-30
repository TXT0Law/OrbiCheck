"use client";

/**
 * Side-by-side visualisation of finding severity (Donut) + V2 score breakdown
 * (Radar). Single source for both T1.2 (severity panel) and T1.3 (breakdown
 * panel) so the layout stays consistent.
 *
 * Reads the camelCase `securityScoreBreakdown.categoryScores` shape — the
 * single source of truth defined in `shared/types/scan.ts` (T0.2).
 */

import { ScoreBreakdownRadar } from "@/components/scan/charts/score-breakdown-radar";
import { SeverityDistributionChart } from "@/components/scan/charts/severity-distribution-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanDetail } from "@/shared/types/scan";

export interface SeverityAndBreakdownSectionProps {
  detail: ScanDetail;
}

const RUNNING_STATUSES: ReadonlyArray<ScanDetail["status"]> = [
  "pending",
  "running",
];

function severityEmptyMessage(status: ScanDetail["status"]): string {
  if (RUNNING_STATUSES.includes(status)) {
    return "Severity donut populates as modules finish — none reported yet.";
  }
  return "No prioritised findings — donut hidden when severity counts are all zero.";
}

function breakdownEmptyMessage(status: ScanDetail["status"]): string {
  if (RUNNING_STATUSES.includes(status)) {
    return "Score breakdown will be available once all modules contribute their sub-scores.";
  }
  return "Score breakdown unavailable for this scan; the V2 analyzer did not return category sub-scores.";
}

export function SeverityAndBreakdownSection({
  detail,
}: SeverityAndBreakdownSectionProps) {
  const breakdown = detail.securityScoreBreakdown;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Severity Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SeverityDistributionChart
            data={detail.severity}
            emptyMessage={severityEmptyMessage(detail.status)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Score Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreBreakdownRadar
            data={breakdown?.categoryScores ?? null}
            emptyMessage={breakdownEmptyMessage(detail.status)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
