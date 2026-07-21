"use client";

import dynamic from "next/dynamic";

import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { ExecutiveSummaryCard } from "@/components/scan/summary/executive-summary-card";
import { ModuleTimelineCard } from "@/components/scan/summary/module-timeline-card";
import { RecommendationsCard } from "@/components/scan/summary/recommendations-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SeverityAndBreakdownSection = dynamic(
  () =>
    import("@/components/scan/summary/severity-and-breakdown-section").then(
      (module) => module.SeverityAndBreakdownSection,
    ),
  {
    loading: () => (
      <p className="text-sm text-muted-foreground" role="status">
        Loading security charts…
      </p>
    ),
    ssr: false,
  },
);

function getCategoryStatusClass(status: "pass" | "warn" | "fail") {
  if (status === "pass") {
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
  }

  if (status === "warn") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
  }

  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
}

function getSeverityBadgeClass(level: string) {
  if (level === "critical") {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  }

  if (level === "high") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200";
  }

  if (level === "medium") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
  }

  return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
}

function categorySummaryEmptyMessage(status: string): string {
  if (status === "pending" || status === "running") {
    return "Category summary will appear as modules finish.";
  }
  return "No category summary for this scan. Grouping rules may not cover the current module results yet, or checks produced nothing to group.";
}

function keyFindingsEmptyMessage(status: string): string {
  if (status === "pending" || status === "running") {
    return "No key findings yet — prioritized issues appear as modules complete.";
  }
  return "No key findings — no high-priority issues were detected. Open individual module pages for full raw results.";
}

const KEY_FINDINGS_DISPLAY_LIMIT = 8;

export default function ScanSummaryPage() {
  const { detail } = useScanDetailContext();

  // Defensive: ensure required summary fields exist (may be missing during rescan / partial load)
  const severity = detail.severity ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const categorySummary = Array.isArray(detail.categorySummary) ? detail.categorySummary : [];
  const keyFindings = Array.isArray(detail.keyFindings) ? detail.keyFindings : [];

  const safeDetail = { ...detail, severity };

  return (
    <div className="space-y-6">
      <ModuleTimelineCard detail={safeDetail} />

      <ExecutiveSummaryCard detail={safeDetail} />

      <SeverityAndBreakdownSection detail={safeDetail} />

      {categorySummary.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {categorySummary.map((category) => (
            <Card key={category.category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">{category.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-zinc-600 dark:text-zinc-300">Modules checked: {category.modulesChecked}</p>
                <p className="text-zinc-600 dark:text-zinc-300">Issues found: {category.issuesFound}</p>
                <Badge className={`border-transparent capitalize ${getCategoryStatusClass(category.status)}`}>
                  {category.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Category overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{categorySummaryEmptyMessage(detail.status)}</p>
          </CardContent>
        </Card>
      )}

      <RecommendationsCard detail={safeDetail} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Key Findings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {keyFindings.length > 0 ? (
            keyFindings.slice(0, KEY_FINDINGS_DISPLAY_LIMIT).map((finding) => (
              <div
                key={finding.id ?? `${finding.module ?? "item"}-${finding.title}`}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                    {finding.module?.replace(/-/g, " ") ?? "Other"}
                  </h4>
                  <Badge className={`shrink-0 border-transparent capitalize ${getSeverityBadgeClass(finding.severity)}`}>
                    {finding.severity}
                  </Badge>
                </div>
                <p className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">{finding.title}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{finding.description}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{keyFindingsEmptyMessage(detail.status)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Scan Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-muted-foreground">Domain</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{detail.domain}</p>
          </div>
          <div>
            <p className="text-muted-foreground">URL</p>
            <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{detail.url}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Scanned At</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{detail.scannedAt}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{detail.duration}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant="secondary" className="mt-1 capitalize">{detail.status}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
