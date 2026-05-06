"use client";

/**
 * Phase 5 / T5.2 — Scan-to-scan diff visualisation.
 *
 * Pure presentation: takes the already-fetched ``ScanDiffResponse`` and
 * renders six sections:
 *   1. Summary header (base vs compare scan IDs + scores)
 *   2. Severity delta table (per bucket: base / compare / Δ)
 *   3. Category breakdown delta (V2 weighted dimensions)
 *   4. Added findings (present in compare, missing in base)
 *   5. Removed findings (present in base, missing in compare)
 *   6. Empty-diff hint when both lists + delta are zero
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ScanCategoryScoreDelta,
  ScanDiffResponse,
  ScanFindingDelta,
  ScanSeverityDelta,
  SeverityCounts,
} from "@/shared/types/scan";

export interface ScanDiffViewProps {
  diff: ScanDiffResponse;
}

const SEVERITY_KEYS: Array<keyof SeverityCounts> = [
  "critical",
  "high",
  "medium",
  "low",
];

const CATEGORY_KEYS = [
  "transport",
  "httpSecurity",
  "threatIntel",
  "infrastructure",
  "bestPractices",
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  transport: "Transport",
  httpSecurity: "HTTP Security",
  threatIntel: "Threat Intel",
  infrastructure: "Infrastructure",
  bestPractices: "Best Practices",
};

function deltaTone(
  value: number,
  options?: { lowerIsBetter?: boolean },
): string {
  if (value === 0) return "text-muted-foreground";
  const lowerIsBetter = options?.lowerIsBetter ?? true;
  const isImprovement = lowerIsBetter ? value < 0 : value > 0;
  return isImprovement
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
}

function formatSignedInt(value: number): string {
  if (value > 0) return `+${value}`;
  return value.toString();
}

function formatSignedDecimal(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) return `+${rounded.toFixed(2)}`;
  return rounded.toFixed(2);
}

function severityBadgeClass(level: string): string {
  if (level === "critical") {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  }
  if (level === "high") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200";
  }
  if (level === "medium") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
  }
  if (level === "low") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
  }
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function FindingRow({ finding }: { finding: ScanFindingDelta }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold capitalize text-zinc-900 dark:text-zinc-100">
          {finding.module ? finding.module.replace(/-/g, " ") : "Other"}
        </h4>
        <Badge
          className={`shrink-0 border-transparent capitalize ${severityBadgeClass(
            finding.severity,
          )}`}
        >
          {finding.severity}
        </Badge>
      </div>
      <p className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">
        {finding.title}
      </p>
      {finding.description ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {finding.description}
        </p>
      ) : null}
    </div>
  );
}

function SeverityDeltaTable({ severityDelta }: { severityDelta: ScanSeverityDelta }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2">Severity</th>
          <th className="py-2 text-right">Base</th>
          <th className="py-2 text-right">Compare</th>
          <th className="py-2 text-right">Δ</th>
        </tr>
      </thead>
      <tbody>
        {SEVERITY_KEYS.map((key) => {
          const base = severityDelta.base[key] ?? 0;
          const compare = severityDelta.compare[key] ?? 0;
          const delta = severityDelta.delta[key] ?? 0;
          return (
            <tr key={key} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-2 capitalize">{key}</td>
              <td className="py-2 text-right tabular-nums">{base}</td>
              <td className="py-2 text-right tabular-nums">{compare}</td>
              <td
                className={`py-2 text-right font-semibold tabular-nums ${deltaTone(
                  delta,
                )}`}
              >
                {formatSignedInt(delta)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BreakdownDeltaTable({
  breakdownDelta,
}: {
  breakdownDelta: ScanCategoryScoreDelta;
}) {
  if (!breakdownDelta.base || !breakdownDelta.compare || !breakdownDelta.delta) {
    return (
      <p className="text-sm text-muted-foreground">
        Breakdown unavailable — at least one scan has no derived V2 security score.
      </p>
    );
  }
  const base = breakdownDelta.base;
  const compare = breakdownDelta.compare;
  const delta = breakdownDelta.delta;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2">Category</th>
          <th className="py-2 text-right">Base</th>
          <th className="py-2 text-right">Compare</th>
          <th className="py-2 text-right">Δ</th>
        </tr>
      </thead>
      <tbody>
        {CATEGORY_KEYS.map((key) => {
          const baseScore = base[key] ?? 0;
          const compareScore = compare[key] ?? 0;
          const deltaScore = delta[key] ?? 0;
          return (
            <tr key={key} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-2">{CATEGORY_LABELS[key]}</td>
              <td className="py-2 text-right tabular-nums">{baseScore.toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums">{compareScore.toFixed(2)}</td>
              <td
                className={`py-2 text-right font-semibold tabular-nums ${deltaTone(
                  deltaScore,
                  { lowerIsBetter: false },
                )}`}
              >
                {formatSignedDecimal(deltaScore)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ScanDiffView({ diff }: ScanDiffViewProps) {
  const totalSeverityDelta = SEVERITY_KEYS.reduce(
    (sum, key) => sum + Math.abs(diff.severityDelta.delta[key] ?? 0),
    0,
  );
  const isUnchanged =
    diff.addedFindings.length === 0 &&
    diff.removedFindings.length === 0 &&
    totalSeverityDelta === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Scan diff summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Base scan</p>
            <Link
              href={`/dashboard/scan/${diff.baseScanId}`}
              className="block font-medium text-zinc-900 hover:underline dark:text-zinc-100"
            >
              {diff.baseDomain || diff.baseScanId}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatTimestamp(diff.baseCompletedAt)} • Score{" "}
              {diff.baseScore ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Compare scan</p>
            <Link
              href={`/dashboard/scan/${diff.compareScanId}`}
              className="block font-medium text-zinc-900 hover:underline dark:text-zinc-100"
            >
              {diff.compareDomain || diff.compareScanId}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatTimestamp(diff.compareCompletedAt)} • Score{" "}
              {diff.compareScore ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {isUnchanged ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Both scans report the same key findings and severity counts. Nothing changed.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Severity delta</CardTitle>
          </CardHeader>
          <CardContent>
            <SeverityDeltaTable severityDelta={diff.severityDelta} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Category score delta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownDeltaTable breakdownDelta={diff.breakdownDelta} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              New in compare ({diff.addedFindings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {diff.addedFindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No new findings introduced by the compare scan.
              </p>
            ) : (
              diff.addedFindings.map((finding) => (
                <FindingRow
                  key={`added-${finding.module ?? "other"}-${finding.title}`}
                  finding={finding}
                />
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Resolved in compare ({diff.removedFindings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {diff.removedFindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No findings cleared since the base scan.
              </p>
            ) : (
              diff.removedFindings.map((finding) => (
                <FindingRow
                  key={`removed-${finding.module ?? "other"}-${finding.title}`}
                  finding={finding}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
