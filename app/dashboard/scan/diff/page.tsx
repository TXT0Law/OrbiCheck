"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ScanDiffView } from "@/components/scan/diff/scan-diff-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScanDiff } from "@/lib/hooks/use-scan-trend";

/**
 * Phase 5 / T5.2 — scan-to-scan diff page.
 *
 * The page is a thin layout wrapper that reads ``baseId`` / ``compareId``
 * from the URL query string, asks the backend for the diff, and delegates
 * rendering to ``ScanDiffView``. Wrapped in ``Suspense`` because Next.js
 * App Router requires it for components that consume ``useSearchParams``.
 */
export default function ScanDiffPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/dashboard/scan"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to scans
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Scan diff
        </h1>
        <p className="text-sm text-muted-foreground">
          Compare two completed scans (typically same domain) — see new findings,
          resolved findings, and severity / score deltas.
        </p>
      </header>

      <Suspense
        fallback={
          <Card>
            <CardContent className="py-10 text-sm text-muted-foreground">
              Loading diff parameters...
            </CardContent>
          </Card>
        }
      >
        <ScanDiffPageInner />
      </Suspense>
    </div>
  );
}

function ScanDiffPageInner() {
  const searchParams = useSearchParams();
  const baseId = searchParams.get("baseId")?.trim() || "";
  const compareId = searchParams.get("compareId")?.trim() || "";

  const diffQuery = useScanDiff(baseId || undefined, compareId || undefined);

  if (!baseId || !compareId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Missing scan IDs
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Open Reports and use Compare on a completed report to choose two
          scans.
        </CardContent>
      </Card>
    );
  }

  if (baseId === compareId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Same scan selected on both sides
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Pick two different scans to see a meaningful diff.
        </CardContent>
      </Card>
    );
  }

  if (diffQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          Computing diff...
        </CardContent>
      </Card>
    );
  }

  if (diffQuery.error || !diffQuery.data) {
    const message =
      diffQuery.error instanceof Error
        ? diffQuery.error.message
        : "The diff could not be loaded. Verify both scan IDs belong to your account.";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-red-600">
            Failed to load diff
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 dark:text-zinc-300">
          {message}
        </CardContent>
      </Card>
    );
  }

  return <ScanDiffView diff={diffQuery.data} />;
}
