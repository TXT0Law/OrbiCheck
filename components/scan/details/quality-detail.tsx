"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QualityResult } from "@/shared/types/scan";

interface QualityDetailProps {
  data: QualityResult | null;
}

function getScoreColor(score: number): string {
  if (score >= 90) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = getScoreColor(score);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        className="h-24 w-24 -rotate-90"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${label} score: ${score} out of 100`}
      >
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-zinc-200 dark:text-zinc-700"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-bold" style={{ color }}>
          {score}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">N/A</Badge>;
  const label = score >= 0.9 ? "Good" : score >= 0.5 ? "Needs Work" : "Poor";
  const cls =
    score >= 0.9
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
      : score >= 0.5
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";

  return <Badge className={`border-transparent ${cls}`}>{label}</Badge>;
}

export function QualityDetail({ data }: QualityDetailProps) {
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
            <p className="text-xs text-muted-foreground">
              {data.finalUrl || data.requestedUrl}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {(data.categories ?? []).map((cat) => (
              <ScoreGauge
                key={cat.id}
                score={cat.displayScore ?? 0}
                label={cat.title}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {(data.audits ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Key Web Vitals</CardTitle>
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
                {(data.audits ?? []).map((audit) => (
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
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
