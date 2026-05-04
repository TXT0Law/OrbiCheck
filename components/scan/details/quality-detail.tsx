"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScoreGauge } from "@/components/scan/charts/score-gauge";
import { QualityCategoryRadar } from "@/components/scan/charts/quality-category-radar";
import type { QualityAudit, QualityResult } from "@/shared/types/scan";

interface QualityDetailProps {
  data: QualityResult | null;
}

const LIGHTHOUSE_GAUGE_THRESHOLDS = { good: 90, warn: 50 } as const;

const AUDIT_GOOD_THRESHOLD = 0.9;
const AUDIT_WARN_THRESHOLD = 0.5;

const TOP_AUDITS_LIMIT = 10;

type AuditFilter = "all" | "fail" | "warn" | "pass";

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">N/A</Badge>;
  const label =
    score >= AUDIT_GOOD_THRESHOLD ? "Good" : score >= AUDIT_WARN_THRESHOLD ? "Needs Work" : "Poor";
  const cls =
    score >= AUDIT_GOOD_THRESHOLD
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
      : score >= AUDIT_WARN_THRESHOLD
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";

  return <Badge className={`border-transparent ${cls}`}>{label}</Badge>;
}

function classifyAudit(audit: QualityAudit): Exclude<AuditFilter, "all"> {
  if (audit.score === null) return "warn";
  if (audit.score >= AUDIT_GOOD_THRESHOLD) return "pass";
  if (audit.score >= AUDIT_WARN_THRESHOLD) return "warn";
  return "fail";
}

function rankAudit(audit: QualityAudit): number {
  if (audit.score === null) return -1;
  return audit.score;
}

const AUDIT_FILTERS: Array<{ id: AuditFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "fail", label: "Failing" },
  { id: "warn", label: "Needs Work" },
  { id: "pass", label: "Passing" },
];

export function QualityDetail({ data }: QualityDetailProps) {
  const [filter, setFilter] = React.useState<AuditFilter>("all");

  if (
    !data ||
    ((!data.categories || data.categories.length === 0) &&
      (!data.audits || data.audits.length === 0))
  ) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
            Quality data not available
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Quality analysis requires a Google Cloud API key. Configure
            GOOGLE_CLOUD_API_KEY in environment variables.
          </p>
        </CardContent>
      </Card>
    );
  }

  const categories = data.categories ?? [];
  const audits = data.audits ?? [];

  const sortedAudits = [...audits].sort((left, right) => rankAudit(left) - rankAudit(right));
  const visibleAudits = sortedAudits
    .filter((audit) => filter === "all" || classifyAudit(audit) === filter)
    .slice(0, TOP_AUDITS_LIMIT);

  return (
    <div className="space-y-4">
      {data.runtimeError && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:border-amber-600/50 dark:bg-amber-900/10">
          <CardContent className="py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Runtime Error:</strong> {data.runtimeError}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Lighthouse Scores</CardTitle>
          {(data.requestedUrl || data.finalUrl) && (
            <p
              className="break-all text-xs text-muted-foreground"
              title={data.finalUrl || data.requestedUrl}
            >
              {data.finalUrl || data.requestedUrl}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_minmax(0,1fr)]">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {categories.map((cat) => (
                <ScoreGauge
                  key={cat.id}
                  score={cat.displayScore}
                  label={cat.title}
                  thresholds={LIGHTHOUSE_GAUGE_THRESHOLDS}
                />
              ))}
            </div>
            <QualityCategoryRadar data={categories} />
          </div>
        </CardContent>
      </Card>

      {audits.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg font-semibold">
                Top Web Vitals (worst first)
              </CardTitle>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filter audits by status"
              >
                {AUDIT_FILTERS.map((option) => {
                  const active = filter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(option.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAudits.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell className="font-medium">{audit.title}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {audit.displayValue || "—"}
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={audit.score} />
                    </TableCell>
                  </TableRow>
                ))}
                {visibleAudits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No audits match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
