"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModuleDetailHref } from "@/lib/constants/scan-module-routes";
import { useScanFindings } from "@/lib/hooks/use-scan-findings";
import type { ScanDetail, ScanSeverity } from "@/shared/types/scan";

export interface RiskObservationsCardProps {
  detail: ScanDetail;
}

const SEVERITY_CLASS: Record<ScanSeverity, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

export function RiskObservationsCard({ detail }: RiskObservationsCardProps) {
  const query = useScanFindings(detail.id, {
    scanStatus: detail.status,
    scanStartedAt: detail.scannedAt,
  });
  const result = query.data;

  let content: ReactNode;
  if (detail.status === "pending" || detail.status === "running") {
    content = <p>Risk observations will be available when the scan completes.</p>;
  } else if (detail.status !== "completed") {
    content = <p>Risk observations are unavailable because this scan did not complete.</p>;
  } else if (query.isLoading) {
    content = <p role="status">Loading risk observations…</p>;
  } else if (query.isError || !result) {
    content = <p role="alert">Risk observations could not be loaded. Their absence does not mean risks are fixed.</p>;
  } else if (result.projectionStatus === "pending") {
    content = <p>Risk observations are awaiting projection. Earlier scan results may still be processing.</p>;
  } else if (result.projectionStatus === "failed") {
    content = <p role="alert">Risk observations could not be projected from this scan. No resolution can be inferred.</p>;
  } else if (result.projectionStatus === "unavailable") {
    content = <p>Risk observations are unavailable for this scan.</p>;
  } else if (result.observations.length === 0) {
    content = <p>No risks were observed in available module evidence. Failed or skipped checks may leave gaps.</p>;
  } else {
    content = (
      <ul className="space-y-3">
        {result.observations.map((observation) => (
          <li key={observation.ruleId} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{observation.title}</h4>
              <Badge className={`shrink-0 border-transparent capitalize ${SEVERITY_CLASS[observation.severity]}`}>
                {observation.severity}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{observation.description}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">Rule: {observation.ruleId}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="text-muted-foreground">Evidence modules:</span>
              {observation.evidenceModules.map((moduleId) => {
                const href = getModuleDetailHref(detail.id, moduleId);
                return href ? (
                  <Link key={moduleId} href={href} className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
                    {moduleId}
                  </Link>
                ) : (
                  <span key={moduleId} className="font-mono">{moduleId}</span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card data-testid="risk-observations-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Tracked risks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
        {content}
        {result?.projectionStatus === "ready" && result.observations.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Findings reflect available evidence only. Missing or skipped modules cannot establish resolution.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
